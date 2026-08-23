// controllers/adminUsersController.js
// Creating, assigning and removing accounts. Super admin only.
//
// ── The scoping exception, stated once per admin controller ──
// Every other controller in this codebase derives its scope from req.shopId and
// never from the request; that rule is the whole of ticket 04. The /api/admin
// controllers are the documented exception: they take the subject as an ordinary
// path or body parameter and mount no resolveShop, because a super admin acting
// across shops is the entire point of the surface.
//
// That is safe only because of the guard above it — routes/admin.js applies
// requireRealAuth and requireRole("super_admin") at the ROUTER level, and a super
// admin already reaches every shop. The parameter selects among things the caller
// may already touch; it widens nobody's access.
//
// If a route is ever added under /api/admin that a *manager* can reach, this
// reasoning collapses. Do not add one. Manager-scoped shop settings belong on a
// shop-scoped route with resolveShop — ticket 09 puts them there.
// ─────────────────────────────────────────────────────────────
//
// Deactivation is the removal path, not deletion: a deleted user takes the
// foreign key from their audit rows with them, and a log that cannot name who
// acted is not a log. The hard delete below exists only for the account created
// by mistake ten minutes ago, and refuses the moment that account has done
// anything at all.
//
// No password, in any form, reaches a response or an audit payload. Every
// user-shaped response goes through toPublicUser for the first half of that, and
// no handler here passes a password to auditQuery for the second.

import { sql } from "../config/db.js";
import {
  hashPassword,
  assertPasswordPolicy,
  normalizeUsername,
} from "../utils/passwords.js";
import { toPublicUser, isRole, ROLES } from "../utils/users.js";
import { toErrorResponse } from "../utils/saleItems.js";
import { auditQuery, diff, countActorEvents, ACTIONS } from "../utils/audit.js";

const UNIQUE_VIOLATION = "23505";
/** foreign_key_violation — an unknown shop id, or an account that acted after we counted. */
const FK_VIOLATION = "23503";

/** The Postgres error code, whether the driver threw it directly or wrapped it. */
const pgCode = (error) => error?.code ?? error?.sourceError?.code ?? null;

const LAST_SUPER_ADMIN = "There must be at least one active super admin";
const NOT_YOURSELF = "You cannot deactivate your own account";
const HAS_ACTIVITY = "This account has activity. Deactivate it instead.";

const fail = (res, error, context) => {
  const { status, message } = toErrorResponse(error);
  if (status === 500) console.error(context, error);
  return res.status(status).json({ message });
};

/**
 * How many active super admins there are, as a query fragment.
 *
 * Inlined into the guarded statements below rather than read first and compared
 * in JavaScript. Read-then-write is the version where two concurrent requests
 * each see a count of two, each conclude they are not the last, and between them
 * leave the system with no way in. Inside the statement, the second one sees the
 * first one's work.
 */
const otherSuperAdminsExist = () => sql`
  (SELECT COUNT(*) FROM users WHERE role = 'super_admin' AND is_active) > 1
`;

/** A positive integer from JSON, or null. */
const asId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * A clean list of shop ids from a request body, or a message.
 *
 * Absent is not the same as empty: absent means "do not touch assignments" at
 * create time, while `[]` means "assign this person to nothing", which is a real
 * state — an account can legitimately exist for a day before anyone places it.
 */
const readShopIds = (value) => {
  if (value === undefined || value === null) return { shopIds: null };
  if (!Array.isArray(value)) return { error: "shop_ids must be an array" };

  const shopIds = [];
  for (const raw of value) {
    const id = asId(raw);
    if (id === null) return { error: "Every shop id must be a whole number" };
    if (!shopIds.includes(id)) shopIds.push(id);
  }
  return { shopIds };
};

/** The assignments a user holds right now, for an audit row's `before`. */
const shopIdsFor = async (userId) => {
  const rows = await sql`
    SELECT shop_id FROM user_shops WHERE user_id = ${userId} ORDER BY shop_id
  `;
  return rows.map((row) => Number(row.shop_id));
};

// GET /api/admin/users
export const listUsers = async (req, res) => {
  try {
    // One grouped query rather than a list plus a lookup per row. The table is
    // small enough that N+1 would not hurt today, which is precisely the reason
    // it would never get fixed later.
    const rows = await sql`
      SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.must_change_password,
             u.last_login_at,
             COALESCE(ARRAY_AGG(us.shop_id) FILTER (WHERE us.shop_id IS NOT NULL), '{}'::int[])
               AS shop_ids
        FROM users u
        LEFT JOIN user_shops us ON us.user_id = u.id
       GROUP BY u.id
       ORDER BY u.is_active DESC, u.username
    `;

    // toPublicUser even though the SELECT is already narrow: it is the one shape
    // a user is allowed to leave this backend in, and a column added to the list
    // above by someone in a hurry should not be able to change that.
    res.status(200).json(
      rows.map((row) => ({
        ...toPublicUser(row),
        shop_ids: (row.shop_ids ?? []).map(Number),
      }))
    );
  } catch (error) {
    console.error("Error listing users", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// POST /api/admin/users
export const createUser = async (req, res) => {
  try {
    const body = req.body ?? {};

    const username = normalizeUsername(body.username);
    if (!username) return res.status(400).json({ message: "Username is required" });
    if (username.length > 50) {
      return res.status(400).json({ message: "Username must be 50 characters or fewer" });
    }

    const fullName = String(body.full_name ?? "").trim();
    if (!fullName) return res.status(400).json({ message: "Full name is required" });

    // Checked here so a bad role is a 400 naming the three, rather than a 23514
    // from the CHECK constraint arriving as a 500.
    if (!isRole(body.role)) {
      return res.status(400).json({ message: `Role must be one of ${ROLES.join(", ")}` });
    }

    // Throws a 400 through the shared badRequest/toErrorResponse pair.
    assertPasswordPolicy(body.password);

    const { shopIds, error } = readShopIds(body.shop_ids);
    if (error) return res.status(400).json({ message: error });
    const assignments = shopIds ?? [];

    // Reserved up front for the same reason createShop reserves a shop id: the
    // assignments and the audit row both need it, and a neon-http batch cannot
    // pass a RETURNING value from one statement to the next. Allocating first is
    // what lets the account, its assignments and its record land together.
    const [{ id }] = await sql`
      SELECT nextval(pg_get_serial_sequence('users', 'id'))::int AS id
    `;

    const passwordHash = await hashPassword(body.password);

    const [rows] = await sql.transaction([
      sql`
        INSERT INTO users (id, username, password_hash, full_name, role,
                           must_change_password, created_by)
        VALUES (${id}, ${username}, ${passwordHash}, ${fullName}, ${body.role},
                TRUE, ${req.user.id})
        RETURNING *
      `,
      ...assignments.map(
        (shopId) => sql`
          INSERT INTO user_shops (user_id, shop_id) VALUES (${id}, ${shopId})
        `
      ),
      auditQuery(req, {
        action: ACTIONS.user.create,
        // Global, like every other account event: creating a user is not
        // something done *at* a shop, even when it assigns them to several.
        shop_id: null,
        entity_type: "user",
        entity_id: id,
        entity_label: username,
        // The password is not here and must never be. utils/audit.js would strip
        // it anyway; not passing it is the version that stays true if somebody
        // edits this object later.
        changes: {
          after: {
            username,
            full_name: fullName,
            role: body.role,
            must_change_password: true,
            shop_ids: assignments,
          },
        },
      }),
    ]);

    // must_change_password is TRUE for every account created here: this password
    // was chosen by somebody else and has very likely travelled through a chat
    // message to reach its owner.
    res.status(201).json({ ...toPublicUser(rows[0]), shop_ids: assignments });
  } catch (error) {
    if (pgCode(error) === UNIQUE_VIOLATION) {
      return res.status(409).json({ message: "That username is already taken" });
    }
    if (pgCode(error) === FK_VIOLATION) {
      return res.status(400).json({ message: "One of those shops does not exist" });
    }
    return fail(res, error, "Error creating user");
  }
};

// PUT /api/admin/users/:id
export const updateUser = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body ?? {};

    const [before] = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (!before) return res.status(404).json({ message: "User not found" });

    // Username is immutable — it is what the audit log's actor snapshot names,
    // and every past row would silently start reading as somebody else.
    if (body.username !== undefined && normalizeUsername(body.username) !== before.username) {
      return res.status(400).json({ message: "A username cannot be changed" });
    }

    const fullName =
      body.full_name === undefined ? before.full_name : String(body.full_name).trim();
    if (!fullName) return res.status(400).json({ message: "Full name is required" });

    const role = body.role === undefined ? before.role : body.role;
    if (!isRole(role)) {
      return res.status(400).json({ message: `Role must be one of ${ROLES.join(", ")}` });
    }

    // Not in the letter of Requirement 4.4, which names deactivation and
    // deletion — but demoting the last active super admin strands the system in
    // exactly the same way, and leaving that open on the same controller that
    // refuses the other two would be strange.
    const demotesLastSuperAdmin =
      before.role === "super_admin" && before.is_active && role !== "super_admin";

    const update = demotesLastSuperAdmin
      ? sql`
          UPDATE users SET full_name = ${fullName}, role = ${role}
           WHERE id = ${id} AND ${otherSuperAdminsExist()}
           RETURNING *
        `
      : sql`
          UPDATE users SET full_name = ${fullName}, role = ${role}
           WHERE id = ${id}
           RETURNING *
        `;

    const [rows] = await sql.transaction([
      update,
      auditQuery(req, {
        action: ACTIONS.user.update,
        shop_id: null,
        entity_type: "user",
        entity_id: id,
        entity_label: before.username,
        changes: diff(before, { full_name: fullName, role }, ["full_name", "role"]),
      }),
    ]);

    // Zero rows means the guard above fired — the row itself was found at the
    // top of the handler. The audit row rolls back with it.
    if (rows.length === 0) {
      return res.status(409).json({ message: LAST_SUPER_ADMIN });
    }

    // The change reaches the user on their next refresh, not immediately: role
    // and shop list live in the access token, and refresh re-reads both. Up to
    // one access-token lifetime, which is R5 in the overview.
    res.status(200).json(toPublicUser(rows[0]));
  } catch (error) {
    return fail(res, error, "Error updating user");
  }
};

/**
 * POST /api/admin/users/:id/deactivate | /reactivate
 *
 * A factory over the pair, so the deactivation's token_version bump and the
 * audit row cannot end up on only one of them.
 */
export const setUserActive = (active) => async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [before] = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (!before) return res.status(404).json({ message: "User not found" });

    // A super admin locking themselves out mid-session is a support call, not a
    // feature. Not racy in any interesting way: the actor is fixed for the
    // request.
    if (!active && before.id === req.user.id) {
      return res.status(409).json({ message: NOT_YOURSELF });
    }

    if (before.is_active === active) {
      return res.status(200).json(toPublicUser(before));
    }

    const guarded = !active && before.role === "super_admin" && before.is_active;

    // Deactivation bumps token_version, and that is the difference between this
    // and setting a flag. Without it the user's refresh token keeps working and
    // they simply refresh their way back in; with it, refresh is refused on the
    // next attempt and the outstanding access token dies within the hour.
    //
    // Reactivation does not bump: there is nothing outstanding to strand, and
    // bumping would sign the person out of a session they are about to be given
    // back.
    const update = guarded
      ? sql`
          UPDATE users SET is_active = FALSE, token_version = token_version + 1
           WHERE id = ${id} AND ${otherSuperAdminsExist()}
           RETURNING *
        `
      : active
        ? sql`UPDATE users SET is_active = TRUE WHERE id = ${id} RETURNING *`
        : sql`
            UPDATE users SET is_active = FALSE, token_version = token_version + 1
             WHERE id = ${id}
             RETURNING *
          `;

    const [rows] = await sql.transaction([
      update,
      auditQuery(req, {
        action: active ? ACTIONS.user.reactivate : ACTIONS.user.deactivate,
        shop_id: null,
        entity_type: "user",
        entity_id: id,
        entity_label: before.username,
        changes: { before: { is_active: before.is_active }, after: { is_active: active } },
      }),
    ]);

    if (rows.length === 0) {
      return res.status(409).json({ message: LAST_SUPER_ADMIN });
    }

    res.status(200).json(toPublicUser(rows[0]));
  } catch (error) {
    return fail(res, error, "Error changing user status");
  }
};

// POST /api/admin/users/:id/reset-password
export const resetPassword = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { password } = req.body ?? {};

    const [before] = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (!before) return res.status(404).json({ message: "User not found" });

    assertPasswordPolicy(password);

    // must_change_password, because an admin now knows this password. The
    // token_version bump signs the account out everywhere, which is the
    // behaviour you want when the reason for the reset is that somebody lost
    // control of it.
    await sql.transaction([
      sql`
        UPDATE users
           SET password_hash = ${await hashPassword(password)},
               must_change_password = TRUE,
               token_version = token_version + 1
         WHERE id = ${id}
      `,
      auditQuery(req, {
        action: ACTIONS.user.passwordReset,
        shop_id: null,
        entity_type: "user",
        entity_id: id,
        entity_label: before.username,
        // The fact only. Neither the password nor its hash goes anywhere near
        // this row.
        changes: null,
      }),
    ]);

    res.status(200).json({ message: "Password reset. They must change it at next sign-in." });
  } catch (error) {
    return fail(res, error, "Error resetting password");
  }
};

// PUT /api/admin/users/:id/shops
export const setUserShops = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [user] = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (!user) return res.status(404).json({ message: "User not found" });

    const { shopIds, error } = readShopIds(req.body?.shop_ids);
    if (error) return res.status(400).json({ message: error });
    if (shopIds === null) {
      return res.status(400).json({ message: "shop_ids is required" });
    }

    const before = await shopIdsFor(id);

    // The whole set is replaced — delete then insert — rather than diffed. The
    // set is small, replacement is atomic, and a partial diff failure would
    // leave someone assigned to a shop nobody chose.
    await sql.transaction([
      sql`DELETE FROM user_shops WHERE user_id = ${id}`,
      ...shopIds.map(
        (shopId) => sql`INSERT INTO user_shops (user_id, shop_id) VALUES (${id}, ${shopId})`
      ),
      auditQuery(req, {
        action: ACTIONS.user.shopsChanged,
        shop_id: null,
        entity_type: "user",
        entity_id: id,
        entity_label: user.username,
        changes: { before: { shop_ids: before }, after: { shop_ids: shopIds } },
      }),
    ]);

    // A super admin's assignments are recorded but never consulted: they reach
    // every active shop by role, which is what resolveShop and shopsForUser both
    // implement. Storing them anyway keeps the row meaningful if they are ever
    // demoted.
    res.status(200).json({ ...toPublicUser(user), shop_ids: shopIds });
  } catch (error) {
    if (pgCode(error) === FK_VIOLATION) {
      return res.status(400).json({ message: "One of those shops does not exist" });
    }
    return fail(res, error, "Error assigning shops");
  }
};

// DELETE /api/admin/users/:id
export const deleteUser = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [before] = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (!before) return res.status(404).json({ message: "User not found" });

    if (before.id === req.user.id) {
      return res.status(409).json({ message: NOT_YOURSELF });
    }

    // The one question that decides this: has this account ever done anything?
    // If it has, deleting it would strip the actor off rows that exist to say
    // who acted. Counted through utils/audit.js rather than with a query here,
    // so the audit table keeps its single reader.
    if ((await countActorEvents(id)) > 0) {
      return res.status(409).json({ message: HAS_ACTIVITY });
    }

    const guarded = before.role === "super_admin" && before.is_active;

    // user_shops cascades on both foreign keys, so the assignments go with the
    // row and there is nothing to clean up first.
    const remove = guarded
      ? sql`DELETE FROM users WHERE id = ${id} AND ${otherSuperAdminsExist()} RETURNING *`
      : sql`DELETE FROM users WHERE id = ${id} RETURNING *`;

    const [rows] = await sql.transaction([
      remove,
      auditQuery(req, {
        action: ACTIONS.user.delete,
        shop_id: null,
        entity_type: "user",
        entity_id: id,
        entity_label: before.username,
        changes: {
          before: { username: before.username, full_name: before.full_name, role: before.role },
        },
      }),
    ]);

    if (rows.length === 0) {
      return res.status(409).json({ message: LAST_SUPER_ADMIN });
    }

    res.status(204).end();
  } catch (error) {
    // The count above and the delete are two statements, so an account that acts
    // in between them would slip through — except that audit_log.actor_user_id
    // is a foreign key, so the delete fails instead. Same answer, one round trip
    // later.
    if (pgCode(error) === FK_VIOLATION) {
      return res.status(409).json({ message: HAS_ACTIVITY });
    }
    return fail(res, error, "Error deleting user");
  }
};
