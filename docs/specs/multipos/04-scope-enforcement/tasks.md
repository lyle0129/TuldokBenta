# Implementation Plan: Enforce Auth & Shop Scope Across the Existing API

## Overview

Add a shop predicate to every SQL statement in five controllers plus `utils/invoiceNumber.js`,
then mount the middleware from ticket 03 on every existing route.

Work **one controller at a time, end to end.** Do not do "all the mounting" then "all the
predicates" — that intermediate state authenticates every route while still serving Shop 1's
data to everyone, which looks like it works and is exactly the bug this ticket prevents.

Keep `LEGACY_UNAUTH=true` throughout. The deployed frontend must keep working after every
task in this list.

## Tasks

- [ ] 1. Rewrite `backend/utils/invoiceNumber.js` for per-shop allocation
  - Add a `prefix` parameter to `formatInvoiceNumber` and `parseInvoiceSeq`, defaulting to the
    existing `INVOICE_PREFIX` so nothing else breaks mid-refactor
  - Replace `highestInvoiceSeq` with `allocateInvoice(sql, shopId)`, returning `{ seq, invoice }`
    from the single query in the design — it reads the shop's prefix and its next free
    sequence from the same snapshot in one round trip
  - Add `shopId` to `isInvoiceTaken` and scope both halves of its UNION
  - Delete `highestInvoiceSeq` rather than leaving it beside the new function; a second,
    prefix-blind allocation path is how the two drift
  - Preserve the existing explanatory comments about why both tables must be read and why
    unparseable numbers yield NULL rather than NaN
  - _Requirements: 4.1, 4.2, 4.5, 4.8_

- [ ] 2. Add invoice property tests
  - Extend `backend/utils/invoiceNumber.test.js` with P1 (round-trip under any prefix),
    P2 (parsing is prefix-sensitive) and P3 (never `NaN`), using `fast-check`
  - _Requirements: 4.2, 4.8_

- [ ] 3. Scope `controllers/openSalesController.js` — 11 statements
  - `applyStockAndSale(shopId, deltas, saleQueries)` — add `shop_id = ${shopId} AND` to the
    inventory `UPDATE`. **This is the most important predicate in the ticket**: sale lines
    match inventory by name string with no foreign key, so without it a sale at one shop
    decrements another shop's stock for every shared item name
  - `loadStockFor(shopId, deltas)` — same predicate
  - `getOpenSales` — replace `WHERE 1=1 ${dateFilter}` with `WHERE shop_id = ${req.shopId} ${dateFilter}`;
    the placeholder existed only so the optional fragment could start with `AND`, and the shop
    predicate now fills that role
  - `getNextInvoice` — use `allocateInvoice`
  - `createOpenSale` — allocate per shop; `INSERT` sets `shop_id` **and** `invoice_seq`; keep
    the retry-on-`23505` loop, now keyed on the composite constraint
  - `updateOpenSale`, `deleteOpenSale` — scope both the `SELECT` and the mutation
  - `paySale` — scope the method check, the `SELECT`, and carry `shop_id` and `invoice_seq`
    into the `closed_sales` `INSERT`; scope the `DELETE`
  - `revertSale` — the mirror image
  - Keep both moves inside their existing `sql.transaction([...])` batches
  - _Requirements: 3.1, 3.2, 3.3, 3.5, 4.3, 4.6, 4.7, 4.9, 5.1–5.5, 6.1, 8.2, 8.3_

- [ ] 4. Scope `controllers/closedSalesController.js` — 5 statements
  - `getClosedSales` — add the shop predicate alongside the existing four NULL-tolerant date
    bounds
  - `updateClosedSale` — scope the `SELECT`, the payment-method check and the `UPDATE`
  - `deleteClosedSale` — scope the `DELETE`
  - _Requirements: 3.1, 3.3, 6.2, 6.3_

- [ ] 5. Scope `controllers/inventoryController.js` — 8 statements
  - `selectOrdered`, `createOrRestockItem` (both the existence `SELECT` and the `UPDATE`),
    `updateItem`, `restockItem`, `deleteItem`
  - Scope the `MAX(sort_order) + 1` subquery in the insert, or a new shop's first item
    inherits another shop's ordering
  - Scope every generated `UPDATE` in `reorderInventory`
  - _Requirements: 3.1, 3.2, 3.3, 3.6_

- [ ] 6. Scope `controllers/servicesController.js` — 5 statements
  - Same shape as task 5: `selectOrdered`, `createService` (including the `MAX(sort_order)`
    subquery), `updateService`, `deleteService`, and every `UPDATE` in `reorderServices`
  - _Requirements: 3.1, 3.2, 3.3, 3.6_

- [ ] 7. Scope `controllers/paymentMethodsController.js` — 7 statements
  - `selectOrdered` — scope the outer query **and** the `usage_count` subquery. Correlate the
    inner side as `cs.shop_id = pm.shop_id` rather than against `req.shopId`, so the statement
    is correct by construction rather than by two values happening to match
  - `createPaymentMethod` (including the `MAX(sort_order)` subquery), `updatePaymentMethod`,
    `deletePaymentMethod`, and every `UPDATE` in `reorderPaymentMethods`
  - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.7_

- [ ] 8. Add per-route role guards in the five route files
  - Import `requireRole` from `../middleware/auth.js`
  - Apply `requireRole("manager","super_admin")` to every write route on inventory, services
    and payment methods
  - Leave `GET /` on all three **unguarded by role** — the till renders its catalog from them
    and workers must reach them
  - Leave every open-sales, pay, revert and closed-sales route open to all three roles
  - Routers stay thin: guards and handler references only, no logic
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] 9. Mount the middleware in `server.js`
  - Add `requireAuth, resolveShop` to all five existing `app.use` mounts
  - Leave `/api/health` public — `config/cron.js` pings it every 14 minutes to keep the host
    awake, and breaking that puts the backend to sleep
  - Leave the `/api/auth` mount exactly as ticket 03 left it
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 10. Run the structural checks
  - `rg -n "req\.(body|query|params)\.(shop_id|shopId)" backend/` returns nothing (SP1)
  - `rg -n "legacyUnauth|LEGACY_UNAUTH" backend/controllers/` returns nothing (SP2)
  - Run the completeness grep from the design and account for every hit; treat it as a way to
    find what the manual pass missed, not as evidence the manual pass was unnecessary
  - Re-count statements against the design's per-file table: 8 / 11 / 5 / 5 / 7 / 2
  - _Requirements: 3.4, 7.4_

- [ ] 11. Run the two-shop integration matrix
  - Set up a scratch database with two shops, each holding an item named `Bleach` and a
    service named `Wash`, plus a manager and a worker assigned only to Shop A. Create Shop B
    by direct SQL — the API for it arrives in ticket 06
  - Run all sixteen scenarios from the design's Testing Strategy
  - **Run scenario 8 first and again last**: selling `Bleach` at Shop A must leave Shop B's
    `Bleach` stock untouched. It is the failure this ticket exists to prevent and it is
    silent unless specifically checked
  - _Requirements: 2.2, 2.3, 3.1–3.8, 4.4, 4.6, 4.7, 5.1–5.4, 6.1, 6.2_

- [ ] 12. Verify the legacy window both ways
  - With `LEGACY_UNAUTH=true` and the **unmodified** frontend, walk all seven routes; every
    list, total and count matches what it showed before this ticket
  - Set `LEGACY_UNAUTH=false`, reload, and confirm the old frontend now fails with 401s —
    proving the bypass is what was carrying it and that nothing else is left open
  - Set it back to `true` before deploying
  - _Requirements: 7.1, 7.2, 7.3_

- [ ] 13. Verification checkpoint
  - `npm test` in `backend/` passes
  - `utils/saleItems.js`, `utils/paymentMethods.js` and `utils/reorder.js` are **unmodified**,
    and their tests are unchanged. If either had to change, logic leaked into a module meant
    to stay free of scope — investigate before closing out
  - Every endpoint keeps its existing method, path, request shape and response shape
  - Ask the user if any questions arise before closing out

## Notes

- If this overruns a session, split at task 7/8: tasks 1–7 can ship with the middleware
  unmounted (every controller correct, enforcement still off), and tasks 8–9 turn it on.
  Split by controller, never by layer.
- A row that exists but belongs to another shop returns **404**, not 403. Adding `shop_id` to
  a `WHERE id = …` makes the row simply not match, so the existing not-found path fires with
  no extra code — and a 403 would confirm to the caller that the id exists somewhere.
- Ticket 05 adds audit calls to these same controllers. Landing this ticket cleanly first
  keeps the two diffs readable.
