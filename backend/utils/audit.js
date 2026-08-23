// utils/audit.js
// Recording who changed what.
//
// The whole module turns on one asymmetry: audit writes are frequent and audit
// reads are rare. So writes are made as cheap and as failure-tolerant as
// possible, and reads — which live in controllers/auditController.js and
// nowhere else — are made deliberately awkward.
//
// Two writers, and the difference between them is the substance of this file:
//
//   recordAudit  best-effort. Runs after its subject transaction has already
//                committed, and swallows its own failures. Used for sales,
//                catalog edits and auth events.
//   auditQuery   transactional. Returns an unawaited query for the caller to
//                batch into its own sql.transaction([...]), so the change and
//                its record land together or not at all. Used for privileged
//                actions — date corrections, user and shop management.
//
// Stated plainly, that split says which failures we are willing to accept: we
// will lose the occasional record of a routine sale, and we will never lose the
// record of an admin rewriting history.

import { sql } from "../config/db.js";

/**
 * The complete action vocabulary. Frozen, and the only place these strings are
 * written down.
 *
 * A typo in a literal at a call site would not fail anything — it would quietly
 * create a category that no filter ever shows, which is the failure mode you
 * discover a year later when the row you needed is not in any list.
 */
export const ACTIONS = Object.freeze({
  auth: Object.freeze({
    login: "auth.login",
    loginFailed: "auth.login_failed",
    logout: "auth.logout",
    passwordChanged: "auth.password_changed",
  }),
  sale: Object.freeze({
    create: "sale.create",
    update: "sale.update",
    delete: "sale.delete",
    pay: "sale.pay",
    revert: "sale.revert",
    dateCorrected: "sale.date_corrected",
  }),
  inventory: Object.freeze({
    create: "inventory.create",
    restock: "inventory.restock",
    update: "inventory.update",
    delete: "inventory.delete",
    reorder: "inventory.reorder",
  }),
  service: Object.freeze({
    create: "service.create",
    update: "service.update",
    delete: "service.delete",
    reorder: "service.reorder",
  }),
  paymentMethod: Object.freeze({
    create: "payment_method.create",
    update: "payment_method.update",
    delete: "payment_method.delete",
    reorder: "payment_method.reorder",
  }),
  // Written here rather than in ticket 06 so the vocabulary stays in one place
  // and the read endpoint's filter list is complete before the routes exist.
  user: Object.freeze({
    create: "user.create",
    update: "user.update",
    deactivate: "user.deactivate",
    reactivate: "user.reactivate",
    passwordReset: "user.password_reset",
    shopsChanged: "user.shops_changed",
  }),
  shop: Object.freeze({
    create: "shop.create",
    update: "shop.update",
    deactivate: "shop.deactivate",
  }),
});

/**
 * Key names whose value must never reach the log, in any casing.
 *
 * Stripped unconditionally rather than only when they changed. An audit log is
 * exactly the kind of place a stray `password` field sits unnoticed for years:
 * nobody reads the table until they need it, and by then it has been backed up
 * everywhere. The cheapest defence is for the value to never have been written.
 */
const SECRET_KEYS = new Set([
  "password",
  "password_hash",
  "passwordhash",
  "currentpassword",
  "newpassword",
  "token",
  "accesstoken",
  "refreshtoken",
]);

const isSecret = (key) => SECRET_KEYS.has(String(key).toLowerCase());

/**
 * Pulls the Actor Snapshot off a request. The only place req.user is read for
 * audit purposes.
 *
 * Every field falls back to null rather than to undefined, because a failed
 * login has no req.user at all and `undefined` would be dropped by the object
 * spread below instead of landing as a NULL column.
 */
export const actorFrom = (req) => ({
  actor_user_id: req?.user?.id ?? null,
  actor_username: req?.user?.username ?? null,
  actor_role: req?.user?.role ?? null,
  ip_address: req?.ip ?? null,
});

/**
 * `{ before, after }` narrowed to the keys whose value actually changed.
 *
 * Comparison is by JSON shape, not by ===, so a sale's `items` array — which is
 * a fresh object on every request — is reported as changed only when its
 * contents differ. Dates compare by their ISO form for the same reason.
 *
 * @param {object} before
 * @param {object} after
 * @param {string[]} keys the fields worth watching; anything else is ignored
 */
export const diff = (before = {}, after = {}, keys = []) => {
  const changed = { before: {}, after: {} };

  for (const key of keys) {
    if (isSecret(key)) continue;

    const from = before?.[key];
    const to = after?.[key];
    if (stableString(from) === stableString(to)) continue;

    changed.before[key] = redact(from);
    changed.after[key] = redact(to);
  }

  return changed;
};

/**
 * Comparable text for a value of any shape, or `null` for a value that is not
 * there at all.
 *
 * Absence returns the JS value `null` rather than some sentinel string,
 * precisely so it cannot collide: two absent values compare equal to each
 * other, and no real value — including the literal string "null" — ever
 * compares equal to absence.
 */
const stableString = (value) => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

/**
 * A value with any secret-named key removed, however deeply nested.
 *
 * The top-level key list in `diff` is not enough on its own: a field named
 * something innocent can still hold an object with a `password` inside it.
 */
const redact = (value) => {
  if (value === null || typeof value !== "object") return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(redact);

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isSecret(key))
      .map(([key, nested]) => [key, redact(nested)])
  );
};

/**
 * The full row, from a request and an event.
 *
 * The event is spread LAST so it can override any part of the actor snapshot.
 * That is not a convenience: a failed login knows which account was attempted
 * but has no req.user to read it from, so it passes actor_user_id explicitly.
 *
 * shop_id defaults to the request's resolved scope — never to anything the
 * client sent, which is the rule the whole of ticket 04 is built on — and an
 * event may set it to null for a global action.
 */
const rowFor = (req, event) => {
  const row = { ...actorFrom(req), shop_id: req?.shopId ?? null, ...event };
  return {
    actor_user_id: row.actor_user_id ?? null,
    actor_username: row.actor_username ?? null,
    actor_role: row.actor_role ?? null,
    shop_id: row.shop_id ?? null,
    action: row.action ?? null,
    entity_type: row.entity_type ?? null,
    entity_id: row.entity_id === undefined || row.entity_id === null ? null : Number(row.entity_id),
    entity_label: row.entity_label ?? null,
    // Stringified rather than handed over as an object, matching how `items` is
    // written to its JSONB column everywhere else in this codebase.
    changes: row.changes === undefined || row.changes === null ? null : JSON.stringify(redact(row.changes)),
    ip_address: row.ip_address ?? null,
  };
};

/**
 * Built around a `sql` tag rather than closing over the import, the same shape
 * middleware/shopScope.js and utils/invoiceNumber.js already use. It is what
 * lets the "never throws" property be tested against a tag that always fails,
 * with no database in the loop.
 */
export const makeAuditQuery = (sql) => (req, event) => {
  const row = rowFor(req, event);
  // Returned UNAWAITED on purpose. Every neon-http tagged template is its own
  // auto-committed round trip, so a query has to be handed to
  // sql.transaction([...]) unawaited to join the batch — the same convention
  // applyStockAndSale relies on in openSalesController.js.
  return sql`
    INSERT INTO audit_log (
      actor_user_id, actor_username, actor_role, shop_id,
      action, entity_type, entity_id, entity_label, changes, ip_address
    ) VALUES (
      ${row.actor_user_id}, ${row.actor_username}, ${row.actor_role}, ${row.shop_id},
      ${row.action}, ${row.entity_type}, ${row.entity_id}, ${row.entity_label},
      ${row.changes}, ${row.ip_address}
    )
  `;
};

/**
 * Best-effort audit write. Never throws, never rejects.
 *
 * Called AFTER the subject transaction has committed and, at every call site,
 * after the response has already been sent. A sale that succeeded must not be
 * reported as failed because a log insert did — the money already moved.
 *
 * The try/catch lives here, in the module, rather than at each of the ~25 call
 * sites. That is the whole reason Requirement 4.5 — "the audit module shall not
 * be able to throw into a controller's success path" — is enforceable rather
 * than a thing everyone has to remember.
 */
export const makeRecordAudit = (sql) => {
  const insert = makeAuditQuery(sql);

  return async (req, event) => {
    try {
      await insert(req, event);
    } catch (error) {
      console.error(
        "Audit write failed (the operation itself succeeded):",
        event?.action ?? "unknown action",
        error
      );
    }
  };
};

export const auditQuery = makeAuditQuery(sql);
export const recordAudit = makeRecordAudit(sql);
