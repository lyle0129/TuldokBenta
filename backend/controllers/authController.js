import { sql } from "../config/db.js";
import {
  hashPassword,
  verifyPassword,
  assertPasswordPolicy,
  normalizeUsername,
  DUMMY_HASH,
} from "../utils/passwords.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/tokens.js";
import { toErrorResponse } from "../utils/saleItems.js";
import { recordAudit, ACTIONS } from "../utils/audit.js";

/**
 * One 401 for a wrong password, an unknown username and a deactivated account
 * alike.
 *
 * Distinguishing them turns the login form into an account enumerator: "no such
 * user" tells anyone who asks which usernames are real, and "this account is
 * disabled" tells a former employee their name is still on file. The dummy
 * bcrypt comparison in `login` closes the same hole on the timing side.
 */
const LOGIN_REFUSED = "Incorrect username or password";

/** Same reasoning, for the refresh endpoint's several failure modes. */
const SESSION_EXPIRED = "Session expired. Sign in again.";

/**
 * The one user shape any response is allowed to contain.
 *
 * Everything user-shaped goes through here so that `password_hash` and
 * `token_version` cannot leak — including from a `SELECT *`, which is how they
 * would leak, and including from a column added to `users` next year by someone
 * who never reads this file.
 */
const toPublicUser = (row) => ({
  id: row.id,
  username: row.username,
  full_name: row.full_name,
  role: row.role,
  is_active: row.is_active,
  must_change_password: row.must_change_password,
  last_login_at: row.last_login_at,
});

/**
 * The shops an actor may act on, as the shop picker will render them.
 *
 * A super admin's list is every active shop rather than their assignments —
 * the same rule resolveShop enforces, kept in one place so the picker can never
 * offer a shop the middleware would then refuse, or hide one it would allow.
 *
 * A user with no assignments gets `[]`. That is a real state the frontend has
 * to render (ticket 07), not an error: an account can legitimately exist for a
 * day before anyone assigns it anywhere.
 */
const shopsForUser = async (user) =>
  user.role === "super_admin"
    ? sql`
        SELECT id, name, slug FROM shops
        WHERE is_active = TRUE
        ORDER BY name ASC
      `
    : sql`
        SELECT s.id, s.name, s.slug FROM shops s
        JOIN user_shops us ON us.shop_id = s.id
        WHERE us.user_id = ${user.id} AND s.is_active = TRUE
        ORDER BY s.name ASC
      `;

/** The payload half of a successful sign-in, shared by login and refresh. */
const sessionFor = async (row) => {
  const shops = await shopsForUser(row);
  return {
    accessToken: signAccessToken(row, shops.map((shop) => shop.id)),
    user: toPublicUser(row),
    shops,
  };
};

const findByUsername = async (username) => {
  const rows = await sql`SELECT * FROM users WHERE username = ${username}`;
  return rows[0] ?? null;
};

/**
 * Every auth event, recorded the same way.
 *
 * `shop_id: null` on all four — signing in is not something you do *at* a shop,
 * and there is no req.shopId here anyway: these routes mount requireRealAuth
 * alone, never resolveShop.
 *
 * The actor is passed explicitly rather than left to req.user. Three of the
 * four have one, but the important case is the fourth: a failed login never
 * reaches a guard, so req.user does not exist, and the attempted account is the
 * only thing worth recording.
 *
 * Nothing here ever receives a password. The parameter list makes that
 * checkable by reading the call sites rather than by trusting them.
 */
const recordAuthEvent = (req, action, user, attemptedUsername = null) =>
  recordAudit(req, {
    action,
    shop_id: null,
    actor_user_id: user?.id ?? null,
    actor_username: user?.username ?? attemptedUsername,
    actor_role: user?.role ?? null,
    entity_type: "user",
    entity_id: user?.id ?? null,
    entity_label: user?.username ?? attemptedUsername,
  });

export async function login(req, res) {
  try {
    const { username, password } = req.body ?? {};

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const attempted = normalizeUsername(username);
    const user = await findByUsername(attempted);

    // Compared against a real hash even when there is no account, so an unknown
    // username costs the same ~100ms as a known one. Skipping this would let
    // anyone map out who works here with a stopwatch, no matter how careful the
    // message above is.
    const correct = await verifyPassword(String(password), user?.password_hash ?? DUMMY_HASH);

    if (!user || !correct || !user.is_active) {
      res.status(401).json({ message: LOGIN_REFUSED });

      // The response above is identical for all three failure modes, and this
      // row deliberately is not: the log is read by the one person entitled to
      // know the difference between a wrong password and a name nobody owns.
      //
      // A user we found contributes their id, so a run of attempts against a
      // real account is greppable by actor. An unknown name leaves it NULL and
      // survives as entity_label, which is why that column is not a foreign key.
      recordAuthEvent(req, ACTIONS.auth.loginFailed, user, attempted);
      return;
    }

    // Recorded before the response so a failure to write it fails the login
    // rather than silently losing the only record of when this account was
    // last used.
    const [updated] = await sql`
      UPDATE users SET last_login_at = CURRENT_TIMESTAMP
      WHERE id = ${user.id}
      RETURNING *
    `;

    res.status(200).json({
      ...(await sessionFor(updated)),
      refreshToken: signRefreshToken(updated),
    });

    // After the response and unawaited. `changes` stays null: there is nothing
    // to record about a sign-in beyond who and when, and the two things that
    // were in scope here — the password and the tokens — must never be written
    // down anywhere.
    recordAuthEvent(req, ACTIONS.auth.login, updated);
  } catch (error) {
    console.error("Error signing in", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

/**
 * Trades a refresh token for a fresh access token.
 *
 * Everything is re-read from the database rather than carried across from the
 * old token: role, shop assignments, and whether the account still exists at
 * all. That re-read is the entire reason the refresh token holds nothing but an
 * id and a version — it is the point at which a demotion, a reassignment or a
 * deactivation catches up with a session, and the longest anything stale can
 * survive is one access-token lifetime.
 */
export async function refresh(req, res) {
  try {
    const { refreshToken } = req.body ?? {};
    const payload = refreshToken && verifyRefreshToken(refreshToken);

    if (!payload) {
      return res.status(401).json({ message: SESSION_EXPIRED });
    }

    const rows = await sql`SELECT * FROM users WHERE id = ${payload.sub}`;
    const user = rows[0];

    // token_version is the "sign out everywhere" lever: bumping the stored
    // value strands every refresh token ever issued to this account, including
    // ones held by a device nobody can reach.
    if (!user || !user.is_active || Number(user.token_version) !== Number(payload.tv)) {
      return res.status(401).json({ message: SESSION_EXPIRED });
    }

    // No refresh rotation: the same refresh token stays valid for its full
    // lifetime. Rotating would mean a dropped response signs the user out, and
    // detecting replay properly needs the server-side store this design
    // deliberately does without.
    res.status(200).json(await sessionFor(user));
  } catch (error) {
    console.error("Error refreshing session", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

/**
 * The current actor, re-read from the database.
 *
 * Not served from the token, even though the token has most of it: this is what
 * the frontend calls on boot to decide whether a stored session is still good,
 * and answering from the token would happily confirm a session belonging to an
 * account that was deleted an hour ago.
 */
export async function me(req, res) {
  try {
    const rows = await sql`SELECT * FROM users WHERE id = ${req.user.id}`;
    const user = rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ message: SESSION_EXPIRED });
    }

    res.status(200).json({ user: toPublicUser(user), shops: await shopsForUser(user) });
  } catch (error) {
    console.error("Error reading the current user", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

/**
 * Signs out. Server-side, deliberately a no-op.
 *
 * There is no token blacklist. Blacklisting a stateless JWT needs a store and a
 * lookup on every single request, which reintroduces exactly the per-request
 * database read that putting the role and shop list in the token exists to
 * avoid — and it would sit on the till's hot path. Instead: the client discards
 * its tokens, the access token dies within its TTL, and token_version is the
 * lever for the case that cannot wait that long.
 *
 * The endpoint exists anyway because ticket 05 needs somewhere to record that a
 * sign-out happened. An audit trail with sign-ins and no sign-outs is a worse
 * answer than a handler that does nothing — and recording it is now the only
 * thing this function does.
 */
export async function logout(req, res) {
  res.status(200).json({ message: "Signed out" });
  recordAuthEvent(req, ACTIONS.auth.logout, req.user);
}

export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body ?? {};

    const rows = await sql`SELECT * FROM users WHERE id = ${req.user.id}`;
    const user = rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ message: SESSION_EXPIRED });
    }

    if (!(await verifyPassword(String(currentPassword ?? ""), user.password_hash))) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Throws a 400 through the shared badRequest/toErrorResponse pair rather
    // than a second error convention just for auth.
    assertPasswordPolicy(newPassword);

    if (await verifyPassword(newPassword, user.password_hash)) {
      return res.status(400).json({ message: "New password must be different" });
    }

    // The token_version bump strands every refresh token for this account,
    // which signs out every *other* device on its next refresh. That is the
    // behaviour you want when the reason for the change is a suspected leak,
    // and it is why this is a bump rather than a no-op.
    //
    // The caller's own access token keeps working until it expires — there is
    // nothing to revoke it with, by design. Ticket 07's client re-authenticates
    // straight after a successful change.
    await sql`
      UPDATE users
      SET password_hash = ${await hashPassword(newPassword)},
          must_change_password = FALSE,
          token_version = token_version + 1
      WHERE id = ${user.id}
    `;

    res.status(200).json({ message: "Password changed. Sign in again on your other devices." });

    // The fact only. Neither password goes anywhere near this row, in any form
    // — not the old one, not the new one, not either hash. utils/audit.js would
    // strip them anyway; not passing them is the version that stays true if
    // somebody edits this line later.
    recordAuthEvent(req, ACTIONS.auth.passwordChanged, user);
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    if (status === 500) console.error("Error changing password", error);
    res.status(status).json({ message });
  }
}
