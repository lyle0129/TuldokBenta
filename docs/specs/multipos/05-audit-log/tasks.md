# Implementation Plan: Audit Log

## Overview

Add the `audit_log` table, a small write helper, a call in each mutating handler, and a
super-admin read endpoint. Existing behaviour is unchanged; the till must not be able to tell
this ticket shipped.

## Tasks

- [ ] 1. Add `audit_log` to `initDB.js`
  - `CREATE TABLE IF NOT EXISTS audit_log (...)` per the design's Data Models, with
    `BIGSERIAL` for `id`
  - Nullable foreign keys to `users(id)` and `shops(id)`; **no** foreign key on `entity_id`,
    since a deleted sale still needs its deletion recorded — the same reasoning already
    written for `paid_using` at `initDB.js:102-109`
  - Three indexes: `(shop_id, occurred_at DESC)`, `(actor_user_id, occurred_at DESC)`,
    `(action, occurred_at DESC)`
  - Comment why the actor is denormalised: a snapshot captures the role someone held *when
    they acted*, which a join can never recover
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6_

- [ ] 2. Create `backend/utils/audit.js`
  - Export `ACTIONS` as a frozen constant holding the full vocabulary from the design, so a
    typo cannot silently invent a category no filter will show
  - Export `actorFrom(req)`, `recordAudit(req, event)`, `auditQuery(req, event)` and
    `diff(before, after, keys)`
  - `recordAudit` wraps its insert in `try/catch` and logs on failure — the `try/catch` lives
    in the module, not at the ~25 call sites, which is what makes Requirement 4.5 enforceable
  - `auditQuery` returns an **unawaited** tagged template so it can join a caller's
    `sql.transaction([...])`, matching the convention in `openSalesController.js:31-40`
  - `diff` strips any key named `password`, `password_hash`, `token`, `accessToken` or
    `refreshToken` from its output unconditionally
  - _Requirements: 2.6, 3.3, 3.5, 4.1, 4.2, 4.5_

- [ ] 3. Write `backend/utils/audit.test.js`
  - Properties P1, P2 and P3 with `fast-check`
  - Plus `actorFrom` returning all nulls when `req.user` is absent — the failed-login case
  - P2 (no secret ever reaches `changes`) must not be skipped: an audit log is exactly where a
    stray password field would sit unnoticed for years
  - _Requirements: 3.3, 3.5, 4.2, 4.5_

- [ ] 4. Add audit calls to the sale controllers
  - `openSalesController.js` — `sale.create`, `sale.update`, `sale.delete`, `sale.pay`,
    `sale.revert`
  - `closedSalesController.js` — `sale.update`, `sale.delete`
  - All Best-effort: call `recordAudit` **after** the `sql.transaction` resolves, never inside
    it, and never in a way that can change the response
  - `entity_label` is the invoice number for every sale event
  - For creates, store a compact summary — invoice number, line count, total — not the whole
    JSONB items array
  - For updates, store `diff(before, after, [...])` over the fields that can change
  - _Requirements: 2.1, 3.1, 3.2, 3.3, 4.1, 4.2, 7.2_

- [ ] 5. Add audit calls to the catalog controllers
  - `inventoryController.js` — `inventory.create`, `inventory.restock`, `inventory.update`,
    `inventory.delete`, `inventory.reorder`
  - `servicesController.js` — the four `service.*` actions
  - `paymentMethodsController.js` — the four `payment_method.*` actions
  - `entity_label` is the item name, service name or method code
  - A reorder records one event for the whole operation, not one per row
  - _Requirements: 2.2, 3.1, 3.3, 4.1_

- [ ] 6. Add audit calls to `authController.js`
  - `auth.login`, `auth.login_failed`, `auth.logout`, `auth.password_changed`
  - A failed login has no `actor_user_id`; put the attempted username in `entity_label` so the
    row is still useful
  - `shop_id` is NULL for all four — these are global events
  - Never put the attempted password anywhere on the row
  - _Requirements: 2.3, 3.1, 3.5_

- [ ] 7. Create `backend/routes/admin.js` and `controllers/auditController.js`
  - The router mounts `requireRealAuth, requireRole("super_admin")` at router level — every
    route under `/api/admin` is super-admin-only without exception, which is the one case
    where a router-level guard is right rather than a mistake
  - Use `requireRealAuth`, not `requireAuth`: the legacy bypass grants only the manager role,
    so it could not reach here anyway, but the strict guard removes the need to reason about it
  - `GET /audit` per the design: `from` and `to` required, `limit` clamped to 100, keyset
    pagination on `(occurred_at, id)`, optional shop / actor / action filters using the
    NULL-tolerant bound pattern from `closedSalesController.getClosedSales`
  - A second small query returns the distinct actions in the range for the client's filter
  - Return the stored Actor Snapshot — do not join `users` or `shops`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8_

- [ ] 8. Mount the admin router
  - One line in `server.js`: `app.use("/api/admin", adminRouter)`
  - Ticket 06 extends this same router; do not create a second one
  - _Requirements: 5.1_

- [ ] 9. Add the retention sweep to `config/cron.js`
  - Disabled unless `AUDIT_RETENTION_DAYS` is set; document it in `backend/.env.example`
  - Runs at most once a day, deleting in batches of 5000 via the `id IN (SELECT … LIMIT …)`
    form — an unbounded `DELETE` on a large table takes a long lock and is a good way to hit a
    statement timeout with nothing to show for it
  - Retention converging over a few days is fine for a boundary measured in months
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 10. Run the structural check
  - `rg -n "audit_log" backend/ | rg -v "utils/audit.js|controllers/auditController.js|config/initDB.js|config/cron.js"`
    returns nothing (SP1)
  - The cost discipline in this ticket is only real if a later join cannot quietly bypass it
  - _Requirements: 5.7_

- [ ] 11. Run the integration checks
  - Every row of the design's integration table
  - **Including the last one**: rename `audit_log` to break the insert, take a sale, and
    confirm the sale still succeeds with an error logged. This is the difference between an
    audit trail and a new way for the till to fail, and it is the check people skip
  - Confirm two shops' events are separable by `shop_id`
  - Confirm a manager gets 403 and an unauthenticated caller gets 401 even with
    `LEGACY_UNAUTH=true`
  - _Requirements: 4.2, 5.1, 5.2, 5.3_

- [ ] 12. Performance sanity check
  - Generate ~50k synthetic rows across a few months
  - A one-day range query returns in the low tens of milliseconds
  - `EXPLAIN` shows an index scan on `(shop_id, occurred_at DESC)`, not a sequential scan
  - Page through 250 rows at `limit=100` and confirm three pages with no duplicates and no gaps
  - _Requirements: 1.6, 5.3, 5.4_

- [ ] 13. Verification checkpoint
  - `npm test` in `backend/` passes
  - No response body shape changed on any pre-existing endpoint
  - No `changes` payload anywhere contains a password, hash or token
  - The two-shop scoping matrix from ticket 04 still passes unchanged
  - Ask the user if any questions arise before closing out

## Notes

- The write-mode split is the substance of this ticket: routine operations use the
  best-effort path and may occasionally lose a record; privileged operations use the
  transactional path and never can. Ticket 06's date correction and user management depend on
  `auditQuery` existing, so do not skip it here even though nothing calls it yet.
- Do not add an audit read to any existing endpoint, now or later. The read endpoint is the
  only reader.
