# Implementation Plan: Tenancy Schema & Backfill

## Overview

Append a tenancy block to `backend/config/initDB.js`. One file changes. No controller, route,
middleware, utility or frontend file is touched.

Tasks 3–8 must execute in the listed order inside the function body — the ordering is what
makes the migration safe against a populated database, and rearranging it will stop the
server booting. See the Migration Approach section of [design.md](design.md).

## Tasks

- [x] 1. Take a production copy and record baselines
  - Create a Neon branch of production (or dump/restore into a scratch database)
  - Record `SELECT COUNT(*)` for `inventory`, `services`, `payment_methods`, `open_sales`,
    `closed_sales` — these are the numbers SP2 checks against
  - Point a local `backend/.env` `DATABASE_URL` at the copy
  - Do **not** run any of this against production until task 10 passes
  - _Requirements: 7.4_

- [x] 2. Add a section header comment in `initDB.js`
  - Append a clearly delimited `--- Multi-shop tenancy ---` comment block after the existing
    `payment_methods` seed, explaining that everything below adds shop scoping, that nothing
    reads it yet, and that the statement order below is load-bearing
  - Match the explanatory comment density of the surrounding file — this file documents *why*
    for every non-obvious statement, and that convention is worth keeping
  - _Requirements: 7.1_

- [x] 3. Create the `shops` table
  - `CREATE TABLE IF NOT EXISTS shops (...)` with the eleven columns from the design's Data
    Models section
  - Comment `slug` to explain it is the stable key while `name` is editable, referencing the
    same reasoning already written for `payment_methods.code` vs `label` at `initDB.js:106-109`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 4. Seed the first shop
  - `INSERT ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM shops)`
  - Values verbatim from `webapp/tuldokbenta_web/src/utils/printInvoice.js:120-132`:
    `SPINCREDIBLE`, `spincredible`, `Rizal Street Ext`, `Mo: 0962-683-7430`, the
    `https://i.ibb.co/NFtDrgj/SPINCREDIBLE.png` logo URL, `Thank you for your purchase!`
  - Comment why the guard is `NOT EXISTS` rather than `ON CONFLICT DO NOTHING`, matching the
    existing note at `initDB.js:133-135`
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 5. Add and backfill `shop_id` on all five scoped tables
  - For each of `inventory`, `services`, `payment_methods`, `open_sales`, `closed_sales`,
    emit the five statements in this exact order:
    `ADD COLUMN IF NOT EXISTS shop_id INT` → `UPDATE ... WHERE shop_id IS NULL` →
    `SET DEFAULT <first shop id>` inside a `DO` block → `ALTER COLUMN shop_id SET NOT NULL` →
    FK add inside a `duplicate_object` guard
  - Resolve the target with `(SELECT id FROM shops ORDER BY id LIMIT 1)` — never a literal `1`.
    The default needs the same value, and a column default cannot hold a subquery, so the `DO`
    block reads it into a variable and `format()`s it in
  - The default is **temporary** and ticket 04 drops it. It exists because no INSERT passes
    `shop_id` until then; see the design's *The temporary default*
  - Do **not** use `ADD COLUMN ... NOT NULL DEFAULT 1`: it hardcodes the id, and the column has
    to be backfilled before it can be constrained anyway
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 3.9_

- [x] 6. Swap the five global UNIQUE constraints for composite ones
  - For each table: `DROP CONSTRAINT IF EXISTS <table>_<column>_key`, then add the composite
    constraint inside a `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` guard,
    matching the idiom at `initDB.js:54-59`
  - Name the new constraints explicitly per the design's constraint table, so they can be
    dropped by name later without guessing Postgres's generated name
  - These statements must come **after** task 5 completes for the same table
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 7. Add and backfill `invoice_seq`
  - `ADD COLUMN IF NOT EXISTS invoice_seq INT` on `open_sales` and `closed_sales`
  - Backfill both with `(substring(invoice_number from '^INV-([0-9]+)$'))::int`, guarded on
    `WHERE invoice_seq IS NULL`
  - Leave the column nullable, and comment that an unparseable hand-edited number stays NULL
    on purpose because `MAX()` ignores NULL — the same tolerance documented at
    `backend/utils/invoiceNumber.js:39-41`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 8. Add the shop-scoped indexes
  - Four `CREATE INDEX IF NOT EXISTS` statements per the design's Step 6
  - `DROP INDEX IF EXISTS idx_closed_sales_paid_using` **last**, after its replacement exists,
    so there is never a window without an index on that column
  - Delete the statement at `initDB.js:124-127` that creates that index, or it is created and
    dropped again on every boot. Move its comment onto the new `(shop_id, paid_using)` index
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 9. Verify the structural properties against the production copy
  - Start the backend against the copy; confirm `✅ Database initialized successfully` and
    that `app.listen` is reached
  - Run SP1: zero NULL `shop_id` in all five tables
  - Run SP2: row counts match the task 1 baselines exactly
  - Run SP3: the five old constraint names return zero rows from `pg_constraint` — check this
    by query, do not assume the `DROP ... IF EXISTS` matched, because a name mismatch fails
    silently and only surfaces when the second shop cannot be created
  - Run SP4: the five new constraint names return exactly five rows
  - Run SP6: no well-formed `invoice_number` was left without an `invoice_seq`
  - Run SP7: all five `shop_id` columns carry the temporary default
  - Restart the server and re-run SP1–SP4 for SP5 (idempotence)
  - _Requirements: 3.6, 3.8, 4.6, 5.2, 7.4_

- [x] 10. Regression-check the API with the unmodified frontend
  - Point the existing frontend at the backend running against the copy
  - Walk the till: create a sale, confirm stock decrements and the invoice number continues
    the existing series; pay it; revert it; delete it
  - Load `/closed-sales` and `/reporting` and confirm the same rows and totals as before
  - Confirm the extra `shop_id` / `invoice_seq` fields in the JSON break nothing
  - Done at the API level: the pre-ticket-02 backend was booted against the copy first and
    every read endpoint captured, then the same endpoints re-captured after the migration and
    diffed field by field — 6,336 closed sales identical and in the same order, the only
    difference being the two added fields. The till walk ran create → pay → revert → delete
    with stock and row counts returning to their starting values. The browser pages themselves
    were **not** clicked through; `/reporting` derives every figure in the browser from these
    same endpoints
  - _Requirements: 7.2, 7.3_

- [ ] 11. Verification checkpoint
  - `npm test` in `backend/` passes unchanged
  - `git diff --stat` shows exactly one changed file: `backend/config/initDB.js`
  - No controller, route, middleware, utility or frontend file appears in the diff
  - Deploy to production only after tasks 9 and 10 have both passed against the copy
  - Ask the user if any questions arise before closing out

## Notes

- Every statement is idempotent; `initDB()` runs on every boot and a second run must be a
  complete no-op.
- A failure anywhere in `initDB()` calls `process.exit(1)` — the backend will not start. This
  is why the rehearsal against a production copy in task 1 is not optional.
- No rollback path is specified because none is needed: every change is additive, and the
  pre-upgrade backend runs unmodified against the post-upgrade schema. See the design's
  Rollback section for the one asymmetry.
- The pre-upgrade backend only keeps working because of the temporary `shop_id` default. It is
  ticket 04's job to remove it, and ticket 04's job alone — dropping it earlier stops the
  deployed app from writing anything at all.
- Ticket 04 is what starts *reading* `shop_id`. Nothing in this ticket makes the API
  multi-tenant; it only makes it possible.
