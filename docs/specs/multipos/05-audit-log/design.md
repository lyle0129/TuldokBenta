# Design: Audit Log

## Overview

One new table, one new module (`backend/utils/audit.js`), one new read endpoint, and a call
added to each mutating handler.

The whole design turns on one asymmetry: **audit writes are frequent and audit reads are
rare.** So writes are made as cheap and as failure-tolerant as possible, and reads are made
deliberately awkward — range-required, capped, keyset-paginated — because a convenient
unbounded read of a table that grows forever is a production incident waiting to happen.

---

## Architecture

```
backend/
├── config/initDB.js          ← + audit_log table and its three indexes
├── config/cron.js            ← + optional retention sweep
├── utils/
│   ├── audit.js              ← NEW: actorFrom, recordAudit, auditQuery, diff
│   └── audit.test.js         ← NEW
├── controllers/
│   ├── auditController.js    ← NEW: the read endpoint
│   ├── openSalesController.js      ← + recordAudit calls
│   ├── closedSalesController.js    ← + recordAudit calls
│   ├── inventoryController.js      ← + recordAudit calls
│   ├── servicesController.js       ← + recordAudit calls
│   ├── paymentMethodsController.js ← + recordAudit calls
│   └── authController.js           ← + recordAudit calls
├── routes/admin.js           ← NEW: mounts /api/admin/audit (extended by ticket 06)
└── server.js                 ← + one mount
```

`routes/admin.js` is created here and extended by ticket 06. It carries
`requireRealAuth, requireRole("super_admin")` at the router level — every route under
`/api/admin` is super-admin-only without exception, so this is the one place a router-level
guard is correct rather than a mistake.

Note it uses `requireRealAuth`, not `requireAuth`: the legacy bypass grants the *manager*
role, so it could never reach a super-admin route anyway, but pinning the strict guard
removes the need to reason about it at all.

---

## Data Models

### `audit_log`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL PRIMARY KEY | `BIGSERIAL` because this table outgrows every other one |
| `occurred_at` | TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| `actor_user_id` | INT NULL REFERENCES users(id) | NULL for a failed login on an unknown username |
| `actor_username` | VARCHAR(50) | Snapshot — never resolved by joining at read time |
| `actor_role` | VARCHAR(20) | Snapshot |
| `shop_id` | INT NULL REFERENCES shops(id) | NULL for global actions |
| `action` | VARCHAR(50) NOT NULL | `domain.verb` |
| `entity_type` | VARCHAR(30) | `open_sale`, `closed_sale`, `inventory`, `service`, `payment_method`, `user`, `shop` |
| `entity_id` | INT | |
| `entity_label` | VARCHAR(255) | Readable without a join: `INV-0421`, `Bleach`, `maria` |
| `changes` | JSONB | `{ before, after }` or a compact summary |
| `ip_address` | VARCHAR(45) | 45 chars fits an IPv6 address |

Indexes: `(shop_id, occurred_at DESC)`, `(actor_user_id, occurred_at DESC)`,
`(action, occurred_at DESC)`.

**Why the actor is denormalised.** Users are deactivated rather than deleted, so a join would
usually work — but "usually" is not good enough for a log whose purpose is to be trusted
years later. Storing the username and role as they were at the time also captures something
a join cannot: the role someone held *when they acted*, not the role they hold now.

There is no foreign key from `entity_id` to anything, deliberately. A sale that has been
deleted still has an audit row describing its deletion, and an FK would make that impossible.
This mirrors the reasoning already recorded in `initDB.js:102-109` for `paid_using`.

### Action vocabulary

| Domain | Actions |
|---|---|
| `auth` | `login`, `login_failed`, `logout`, `password_changed` |
| `sale` | `create`, `update`, `delete`, `pay`, `revert`, `date_corrected` |
| `inventory` | `create`, `restock`, `update`, `delete`, `reorder` |
| `service` | `create`, `update`, `delete`, `reorder` |
| `payment_method` | `create`, `update`, `delete`, `reorder` |
| `user` | `create`, `update`, `deactivate`, `reactivate`, `password_reset`, `shops_changed` |
| `shop` | `create`, `update`, `deactivate` |

Keep this list in one exported constant so a typo in an action string cannot silently create a
new category that no filter will ever show.

---

## Components and Interfaces

### `utils/audit.js`

```js
/** Pulls the Actor Snapshot off a request. The only place req.user is read for audit. */
export const actorFrom = (req) => ({
  actor_user_id: req.user?.id ?? null,
  actor_username: req.user?.username ?? null,
  actor_role: req.user?.role ?? null,
  ip_address: req.ip ?? null,
});

/**
 * Best-effort audit write. Never throws.
 *
 * Called AFTER the subject transaction has committed. A sale that succeeded must not be
 * reported as failed because the log insert did — the money already moved.
 */
export const recordAudit = async (req, event) => {
  try {
    await sql`INSERT INTO audit_log (...) VALUES (...)`;
  } catch (error) {
    console.error("Audit write failed (operation itself succeeded):", event.action, error);
  }
};

/**
 * The same insert as an UNAWAITED query, for batching into a caller's sql.transaction([...]).
 * Used only by privileged actions, where losing the record is worse than losing the change.
 */
export const auditQuery = (req, event) => sql`INSERT INTO audit_log (...) VALUES (...)`;

/** { before, after } narrowed to keys whose value actually changed. */
export const diff = (before, after, keys) => { /* … */ };
```

`recordAudit` swallowing its own errors is the design, not an oversight. Requirement 4.5 —
"the Audit_Module SHALL NOT be able to throw into a controller's success path" — is enforced
by the `try/catch` living inside the module rather than at each of its ~25 call sites.

`auditQuery` returns an unawaited tagged template, matching the convention `applyStockAndSale`
already relies on in `openSalesController.js:31-40`: neon-http auto-commits each template
individually, so a query must be passed to `sql.transaction([...])` unawaited to join the
batch.

### The two write modes, and when each applies

| Mode | Used for | Rationale |
|---|---|---|
| Best-effort (`recordAudit`) | sales, inventory, services, payment methods, auth events | High volume, and the subject operation is worth more than its record. A cashier must never see a sale fail because of a log |
| Transactional (`auditQuery`) | date corrections, user management, shop management (ticket 06) | Low volume, high consequence. A backdated sale with no record of who backdated it defeats the point of having a log |

The asymmetry is the interesting part of this ticket. It says plainly which failures we are
willing to accept: we will lose the occasional record of a routine sale, and we will never
lose the record of an admin rewriting history.

### `controllers/auditController.js`

```js
// GET /api/admin/audit?from=…&to=…&shop_id=…&actor_id=…&action=…&cursor=…&limit=…
```

- `from` and `to` are **required**. Absent either, respond 400. There is no "all time".
- `limit` defaults to 50 and is clamped to 100.
- `cursor` is an opaque `occurred_at|id` pair from the previous page's last row.

```sql
SELECT * FROM audit_log
 WHERE occurred_at >= ${from} AND occurred_at < ${to}
   AND (${shopId}::int   IS NULL OR shop_id       = ${shopId})
   AND (${actorId}::int  IS NULL OR actor_user_id = ${actorId})
   AND (${action}::text  IS NULL OR action        = ${action})
   AND (${cursorAt}::timestamp IS NULL
        OR (occurred_at, id) < (${cursorAt}, ${cursorId}))
 ORDER BY occurred_at DESC, id DESC
 LIMIT ${limit}
```

The NULL-tolerant optional-bound pattern is lifted from `closedSalesController.getClosedSales`,
which the exploration notes single out as the cleaner of the two filtering idioms in this
codebase — a flat template with nullable bounds, rather than the interpolated SQL fragment
`getOpenSales` uses.

**Keyset, not `OFFSET`.** `OFFSET 10000` makes Postgres walk and discard ten thousand rows;
the row-value comparison `(occurred_at, id) < (…, …)` seeks straight into the
`(shop_id, occurred_at DESC)` index. On a table designed to grow forever, the difference is
between a constant-cost page and one that degrades every day.

A second, cheap query returns the distinct actions present in the range, so the client can
populate a filter dropdown without a separate table:

```sql
SELECT DISTINCT action FROM audit_log WHERE occurred_at >= ${from} AND occurred_at < ${to}
```

### Retention sweep

Added to `config/cron.js`, alongside the existing keep-alive job. Disabled unless
`AUDIT_RETENTION_DAYS` is configured.

```sql
DELETE FROM audit_log
 WHERE id IN (
   SELECT id FROM audit_log
    WHERE occurred_at < now() - (${days} || ' days')::interval
    LIMIT 5000
 )
```

Batched at 5000 because an unbounded `DELETE` on a large table takes a long lock and, on a
serverless HTTP connection, is a good way to hit a statement timeout with nothing to show for
it. Running daily with a batch cap means retention converges over a few days rather than in
one risky statement — which is fine for a boundary measured in months.

---

## Error Handling

| Condition | Status | Behaviour |
|---|---|---|
| Best-effort audit write fails | — | Logged to console; the original operation's response is returned unchanged |
| Transactional audit write fails | 500 | The whole subject operation rolls back |
| `GET /api/admin/audit` without `from` or `to` | 400 | `{ message: "A date range is required" }` |
| `limit` above 100 | — | Silently clamped to 100 |
| Malformed `cursor` | 400 | `{ message: "Invalid pagination cursor" }` |
| Non-super-admin reaches `/api/admin/*` | 403 | From the router-level guard |
| Unauthenticated reaches `/api/admin/*` | 401 | From `requireRealAuth` — no legacy bypass |

---

## Correctness Properties

### P1 — `diff` reports only real changes

For any two objects and any key list, every key present in the result of `diff` has different
values in `before` and `after`, and every key absent from the result has equal values.

*Validates: 3.3*

### P2 — `diff` never leaks a secret

For any input objects, the result of `diff` contains no key named `password`,
`password_hash`, `token`, `accessToken` or `refreshToken`, even when the inputs do.

*Validates: 3.5*

### P3 — `recordAudit` never throws

For any event object, including malformed ones and ones whose insert is guaranteed to fail,
`recordAudit` resolves rather than rejecting.

*Validates: 4.2, 4.5*

### P4 — Keyset pagination is total and non-overlapping

For any ordered set of rows and any page size, walking pages by cursor visits every row
exactly once.

*Validates: 5.4*

### Structural property SP1 — nothing else reads the table

```powershell
rg -n "audit_log" backend/ | rg -v "utils/audit.js|controllers/auditController.js|config/initDB.js|config/cron.js"
```
returns nothing.

*Validates: 5.7*

P2 and SP1 are the two worth being strict about. P2 because an audit log is exactly the place
a stray `password` field would sit unnoticed for years; SP1 because the cost discipline in
this ticket is only real if it cannot be quietly bypassed by a later join.

---

## Testing Strategy

### Unit and property tests

`utils/audit.test.js` covering P1, P2 and P3 with `fast-check`, plus `actorFrom` returning all
nulls for a request with no `req.user` (which happens for a failed login).

### Integration checks

| Scenario | Expected |
|---|---|
| Create, pay, then revert a sale | Three rows: `sale.create`, `sale.pay`, `sale.revert`, all carrying the invoice number as `entity_label` |
| Restock an item | One `inventory.restock` row whose `changes` shows the stock before and after |
| Log in with a wrong password | One `auth.login_failed` row with `actor_user_id` NULL and the attempted username in `entity_label` |
| Log in successfully | One `auth.login` row |
| Two shops each create a sale | Each row carries its own `shop_id`; a query filtered to one shop returns only its own |
| Manager calls `GET /api/admin/audit` | 403 |
| Unauthenticated calls it with `LEGACY_UNAUTH=true` | 401 — the admin router uses `requireRealAuth` |
| Super admin calls it without `from`/`to` | 400 |
| Super admin requests `limit=5000` | At most 100 rows returned |
| Page through 250 rows at `limit=100` | Three pages, no duplicates, no gaps |
| Break the audit insert deliberately (rename the table) and take a sale | The sale succeeds; an error is logged |

The last row is the one people skip and the one that matters most — it is the difference
between an audit trail and a new way for the till to fail.

### Performance sanity

With ~50k synthetic rows, a one-day range query returns in the low tens of milliseconds and
`EXPLAIN` shows an index scan on `(shop_id, occurred_at DESC)`, not a sequential scan.
