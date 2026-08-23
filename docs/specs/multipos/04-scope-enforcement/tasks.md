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

- [x] 1. Rewrite `backend/utils/invoiceNumber.js` for per-shop allocation
  - Add a `prefix` parameter to `formatInvoiceNumber` and `parseInvoiceSeq`, defaulting to the
    existing `INVOICE_PREFIX` so nothing else breaks mid-refactor
  - Done with two amendments, both recorded in [design.md](design.md): `allocateInvoice`
    also returns the shop's `prefix` (Requirement 4.8 needs it to parse a caller-supplied
    number), and `parseInvoiceSeq` uses `startsWith` + a digit test rather than building a
    `RegExp` around a shop-editable prefix
  - Replace `highestInvoiceSeq` with `allocateInvoice(sql, shopId)`, returning `{ seq, invoice }`
    from the single query in the design — it reads the shop's prefix and its next free
    sequence from the same snapshot in one round trip
  - Add `shopId` to `isInvoiceTaken` and scope both halves of its UNION
  - Delete `highestInvoiceSeq` rather than leaving it beside the new function; a second,
    prefix-blind allocation path is how the two drift
  - **Leave ticket 02's `invoice_seq` backfill in `initDB.js` exactly where it is.** It is not
    a spent one-time migration: the controllers write `invoice_seq` only from this ticket
    onwards, so every sale taken during the legacy window has it NULL, and `allocateInvoice`
    reads `MAX(invoice_seq)`. The backfill running on this ticket's first boot — before
    `app.listen`, so before a single request is served — is what stops allocation restarting
    at the pre-ticket-02 high-water mark and re-issuing numbers that already exist. Verified
    against a copy of production: a sale created with `invoice_seq` NULL had it populated by
    the next boot. The retry loop would not save you here, because `allocateInvoice` returns
    the same number every time it is asked
  - Preserve the existing explanatory comments about why both tables must be read and why
    unparseable numbers yield NULL rather than NaN
  - _Requirements: 4.1, 4.2, 4.5, 4.8_

- [x] 2. Add invoice property tests
  - Extend `backend/utils/invoiceNumber.test.js` with P1 (round-trip under any prefix),
    P2 (parsing is prefix-sensitive) and P3 (never `NaN`), using `fast-check`
  - P2 needed a constraint the design did not state: prefixes must end in a non-digit,
    or the property is false (`formatInvoiceNumber(1, "A")` is `"A0001"`, which parses
    under prefix `"A0"` as 1). See design.md; the arbitrary and a comment carry the reason
  - _Requirements: 4.2, 4.8_

- [x] 3. Scope `controllers/openSalesController.js` — 11 statements (15 tagged templates; see design.md)
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

- [x] 4. Scope `controllers/closedSalesController.js` — 5 statements
  - `getClosedSales` — add the shop predicate alongside the existing four NULL-tolerant date
    bounds
  - `updateClosedSale` — scope the `SELECT`, the payment-method check and the `UPDATE`
  - `deleteClosedSale` — scope the `DELETE`
  - _Requirements: 3.1, 3.3, 6.2, 6.3_

- [x] 5. Scope `controllers/inventoryController.js` — 8 statements
  - `selectOrdered`, `createOrRestockItem` (both the existence `SELECT` and the `UPDATE`),
    `updateItem`, `restockItem`, `deleteItem`
  - Scope the `MAX(sort_order) + 1` subquery in the insert, or a new shop's first item
    inherits another shop's ordering
  - Scope every generated `UPDATE` in `reorderInventory`
  - _Requirements: 3.1, 3.2, 3.3, 3.6_

- [x] 6. Scope `controllers/servicesController.js` — 5 statements
  - Same shape as task 5: `selectOrdered`, `createService` (including the `MAX(sort_order)`
    subquery), `updateService`, `deleteService`, and every `UPDATE` in `reorderServices`
  - _Requirements: 3.1, 3.2, 3.3, 3.6_

- [x] 7. Scope `controllers/paymentMethodsController.js` — 7 statements (5 tagged templates; see design.md)
  - `selectOrdered` — scope the outer query **and** the `usage_count` subquery. Correlate the
    inner side as `cs.shop_id = pm.shop_id` rather than against `req.shopId`, so the statement
    is correct by construction rather than by two values happening to match
  - `createPaymentMethod` (including the `MAX(sort_order)` subquery), `updatePaymentMethod`,
    `deletePaymentMethod`, and every `UPDATE` in `reorderPaymentMethods`
  - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.7_

- [x] 8. Add per-route role guards in the five route files
  - Import `requireRole` from `../middleware/auth.js`
  - Apply `requireRole("manager","super_admin")` to every write route on inventory, services
    and payment methods
  - Leave `GET /` on all three **unguarded by role** — the till renders its catalog from them
    and workers must reach them
  - Leave every open-sales, pay, revert and closed-sales route open to all three roles
  - Routers stay thin: guards and handler references only, no logic
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 9. Mount the middleware in `server.js`
  - Add `requireAuth, resolveShop` to all five existing `app.use` mounts
  - Moved the bare `app.use("/api", …, openSalesRouter)` mount to **last** of the five.
    Its paths have no prefix of their own, so it matches every request the four specific
    mounts match; registered ahead of them it would resolve scope twice per closed-sales
    and payment-methods request, and `resolveShop`'s super-admin branch is a DB query
  - Leave `/api/health` public — `config/cron.js` pings it every 14 minutes to keep the host
    awake, and breaking that puts the backend to sleep
  - Leave the `/api/auth` mount exactly as ticket 03 left it
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 10. Drop the temporary `shop_id` defaults from `backend/config/initDB.js`
  - **Also required, and not listed here originally:** the `payment_methods` bootstrap
    seed still INSERTed without a `shop_id` and re-fires whenever that table is globally
    empty, so dropping the default would have made `initDB()` exit(1) and stop the backend
    booting. Moved below the tenancy block with an explicit `shop_id`. See design.md
  - Ticket 02 gave `shop_id` a default of the first shop's id on all five scoped tables, so
    the then-unmodified controllers could keep inserting. Tasks 3–7 above have now put an
    explicit `shop_id` in every INSERT, so the default has become a liability: it silently
    lands a statement that forgot its shop in the first shop, which is the exact bug the
    manual pass in this ticket exists to catch
  - In the per-table loop in the tenancy block, replace the `SET DEFAULT` `DO` block with
    `ALTER TABLE <t> ALTER COLUMN shop_id DROP DEFAULT` — idempotent, and it clears the
    default already sitting in production
  - Do this **only after** tasks 3–7 are complete. Landing it earlier breaks every write
  - Confirm by query: `column_default` is NULL for `shop_id` on all five tables in
    `information_schema.columns` (ticket 02's SP7, inverted)
  - _Requirements: 3.2, 3.9_

- [x] 11. Run the structural checks
  - SP1 and SP2 both return nothing. The completeness grep returns 17 lines, every one a
    multi-line statement whose predicate sits on a later line, plus one `@param` comment
    in `utils/paymentMethods.js` — each checked individually against the file
  - `column_default` is NULL for `shop_id` on all five tables (ticket 02's SP7, inverted),
    confirmed against the scratch copy after the boot that applied it
  - `rg -n "req\.(body|query|params)\.(shop_id|shopId)" backend/` returns nothing (SP1)
  - `rg -n "legacyUnauth|LEGACY_UNAUTH" backend/controllers/` returns nothing (SP2)
  - Run the completeness grep from the design and account for every hit; treat it as a way to
    find what the manual pass missed, not as evidence the manual pass was unnecessary
  - Re-count statements against the design's per-file table: 8 / 11 / 5 / 5 / 7 / 2
  - _Requirements: 3.4, 7.4_

- [x] 12. Run the two-shop integration matrix
  - Run against the ticket-02 Neon copy. All sixteen scenarios pass; scenario 8 was run
    first and again last and passed both times (17 checks, 0 failures). Shop B was given
    its own `invoice_prefix` of `SPN-`, which also exercised 4.2 and 4.8: a number
    supplied to Shop B that Shop A owns is accepted and stores `invoice_seq` NULL,
    because it does not parse as Shop B's series
  - Scenario 14 used a third throwaway shop rather than Shop B, since Shop B had already
    been seeded with an item and so no longer had a *first* one to add
  - Set up a scratch database with two shops, each holding an item named `Bleach` and a
    service named `Wash`, plus a manager and a worker assigned only to Shop A. Create Shop B
    by direct SQL — the API for it arrives in ticket 06
  - Run all sixteen scenarios from the design's Testing Strategy
  - **Run scenario 8 first and again last**: selling `Bleach` at Shop A must leave Shop B's
    `Bleach` stock untouched. It is the failure this ticket exists to prevent and it is
    silent unless specifically checked
  - _Requirements: 2.2, 2.3, 3.1–3.8, 4.4, 4.6, 4.7, 5.1–5.4, 6.1, 6.2_

- [x] 13. Verify the legacy window both ways
  - Done at the API level rather than through the browser, the same way ticket 02 task 10
    was. With `LEGACY_UNAUTH=true`, tokenless and header-less requests to all seven routes
    return exactly the pre-ticket baseline — inventory 14, services 7, payment methods 2,
    open 28, closed 6336 — and `/api/next-invoice` answers `INV-6372`, continuing from the
    existing maximum of 6371 rather than restarting (4.4)
  - The tokenless till walk — create, pay, revert, delete — returns stock and both row
    counts to their starting values, and `shop_id` and `invoice_seq` are carried across
    the table move intact
  - With the flag off, all six non-health routes answer 401 and `/api/health` still
    answers 200, so the bypass is demonstrably what was carrying the old frontend
  - With `LEGACY_UNAUTH=true` and the **unmodified** frontend, walk all seven routes; every
    list, total and count matches what it showed before this ticket
  - Set `LEGACY_UNAUTH=false`, reload, and confirm the old frontend now fails with 401s —
    proving the bypass is what was carrying it and that nothing else is left open
  - Set it back to `true` before deploying
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 14. Verification checkpoint
  - `npm test` passes: 129 tests, 0 failures. `initDB()` was run twice and succeeded both
    times, so the moved seed and the dropped defaults are idempotent
  - `utils/saleItems.js`, `utils/paymentMethods.js` and `utils/reorder.js` are unmodified
    and absent from `git status`, as are their tests and everything under `webapp/`
  - `npm test` in `backend/` passes
  - `utils/saleItems.js`, `utils/paymentMethods.js` and `utils/reorder.js` are **unmodified**,
    and their tests are unchanged. If either had to change, logic leaked into a module meant
    to stay free of scope — investigate before closing out
  - Every endpoint keeps its existing method, path, request shape and response shape
  - Ask the user if any questions arise before closing out

## Notes

- If this overruns a session, split at task 7/8: tasks 1–7 can ship with the middleware
  unmounted (every controller correct, enforcement still off), and tasks 8–9 turn it on.
  Split by controller, never by layer. Task 10 belongs with the *second* half — the temporary
  defaults must outlive any partially-scoped intermediate state.
- A row that exists but belongs to another shop returns **404**, not 403. Adding `shop_id` to
  a `WHERE id = …` makes the row simply not match, so the existing not-found path fires with
  no extra code — and a 403 would confirm to the caller that the id exists somewhere.
- Ticket 05 adds audit calls to these same controllers. Landing this ticket cleanly first
  keeps the two diffs readable.
