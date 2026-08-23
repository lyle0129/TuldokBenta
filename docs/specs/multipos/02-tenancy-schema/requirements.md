# Requirements: Tenancy Schema & Backfill

## Introduction

The database has no concept of a shop. Five tables — `inventory`, `services`,
`payment_methods`, `open_sales`, `closed_sales` — hold one shop's data, and four of them
carry **globally** UNIQUE columns that make a second shop impossible: two shops cannot both
stock "Bleach", both offer a payment code of `cash`, or both issue `INV-0001`.

This ticket introduces the `shops` table, adds a `shop_id` to all five tables, backfills
every existing row to Shop 1, and converts the global UNIQUE constraints to composite ones.
It also adds an `invoice_seq` integer column so invoice numbering stops depending on parsing
a display string.

**Nothing reads `shop_id` after this ticket.** Controllers are untouched; the API behaves
identically. This is deliberate — the schema change lands and is verified against production
data on its own, before any query depends on it.

There is no migration tool in this project. `backend/config/initDB.js` runs on every boot and
is the sole source of truth for the schema, so every statement added here must be idempotent
and must be safe to run against a populated production database.

## Glossary

- **DB_Init** — the `initDB()` function in `backend/config/initDB.js`.
- **Shop** — a tenant; one row in `shops`.
- **Shop 1** — the shop the existing data is backfilled to. Its `id` is whatever the first
  seeded row receives, referenced everywhere as *"the first shop"* rather than as a literal.
- **Scoped Table** — one of `inventory`, `services`, `payment_methods`, `open_sales`,
  `closed_sales`.
- **Receipt Profile** — the columns on `shops` that a printed receipt renders: name, address,
  contact number, logo URL, footer text and paper width.
- **Invoice Sequence** — the per-shop integer series backing `invoice_number`.

---

## Requirements

### Requirement 1: The `shops` table

**User Story:** As a super admin, I want shops to be first-class rows, so that each one can
carry its own identity and receipt details.

#### Acceptance Criteria

1. THE DB_Init SHALL create a `shops` table if it does not exist, with columns for identity
   (`id`, `name`, `slug`, `is_active`, `created_at`) and the Receipt Profile
   (`address_line`, `contact_number`, `logo_url`, `receipt_footer`,
   `receipt_paper_width_mm`, `invoice_prefix`).
2. THE `shops.slug` column SHALL be UNIQUE and NOT NULL, serving as the stable key that never
   changes, while `name` is the freely editable display value.
3. THE `shops.invoice_prefix` column SHALL default to `'INV-'`, preserving the current
   invoice format for the existing shop.
4. THE `shops.receipt_paper_width_mm` column SHALL default to `58`, matching the width
   currently hardcoded in `printInvoice.js`.
5. THE `shops.is_active` column SHALL default to `TRUE`.

---

### Requirement 2: Shop 1 is seeded from today's hardcoded receipt values

**User Story:** As the shop owner, I want the existing shop to come out of this migration
looking exactly as it does now, so that receipts printed after the upgrade are identical to
those printed before it.

#### Acceptance Criteria

1. WHEN the `shops` table is empty, THE DB_Init SHALL insert exactly one row seeded with the
   values currently hardcoded in `webapp/tuldokbenta_web/src/utils/printInvoice.js`:
   name `SPINCREDIBLE`, address line `Rizal Street Ext`, contact number `Mo: 0962-683-7430`,
   the existing logo URL, and footer `Thank you for your purchase!`.
2. THE seed SHALL be guarded on the table being empty (`WHERE NOT EXISTS (SELECT 1 FROM shops)`)
   rather than on `ON CONFLICT DO NOTHING`, so that a shop deliberately deleted by an admin
   is not resurrected on the next boot.
3. WHEN the `shops` table already contains at least one row, THE DB_Init SHALL leave it
   untouched.
4. THE seeded row SHALL receive the slug `spincredible`.

---

### Requirement 3: Every scoped table carries a shop

**User Story:** As a developer, I want `shop_id` present and mandatory on every tenant table,
so that a query written without a shop predicate is a bug I can find rather than a silent
data leak.

#### Acceptance Criteria

1. THE DB_Init SHALL add a nullable `shop_id INT` column to each Scoped Table if it does not
   already exist.
2. THE DB_Init SHALL backfill `shop_id` on each Scoped Table to the first shop's `id`,
   updating only rows WHERE `shop_id IS NULL`.
3. THE backfill SHALL resolve the target shop with `(SELECT id FROM shops ORDER BY id LIMIT 1)`
   and SHALL NOT use a literal `1`.
4. AFTER the backfill, THE DB_Init SHALL set `shop_id` to NOT NULL on each Scoped Table.
5. THE DB_Init SHALL add a foreign key from each Scoped Table's `shop_id` to `shops(id)`.
6. WHEN DB_Init runs a second time against an already-migrated database, THE DB_Init SHALL
   complete without error and SHALL modify no rows.
7. THE column addition, backfill and NOT NULL constraint for a given table SHALL execute in
   that order within the same boot.
8. BEFORE setting `shop_id` to NOT NULL, THE DB_Init SHALL set a **temporary** column default
   on `shop_id` resolved from the first shop's `id`, because no INSERT in the codebase passes
   `shop_id` until ticket 04 — without it, Requirement 3.4 would stop every sale, item,
   service and payment method from being created the moment this ticket deploys, and would
   break the `payment_methods` seed, contradicting Requirements 7.2 and 7.3.
9. THE temporary default SHALL be resolved from the `shops` table rather than written as a
   literal, and SHALL be dropped by ticket 04 once every INSERT names its own `shop_id`.

---

### Requirement 4: Global UNIQUE constraints become composite

**User Story:** As a super admin opening a second shop, I want that shop to stock the same
item names and issue the same invoice numbers as the first, so that shops are genuinely
independent of one another.

#### Acceptance Criteria

1. THE DB_Init SHALL replace the global UNIQUE constraint on `inventory.item_name` with a
   composite UNIQUE on `(shop_id, item_name)`.
2. THE DB_Init SHALL replace the global UNIQUE constraint on `services.service_name` with a
   composite UNIQUE on `(shop_id, service_name)`.
3. THE DB_Init SHALL replace the global UNIQUE constraint on `payment_methods.code` with a
   composite UNIQUE on `(shop_id, code)`.
4. THE DB_Init SHALL replace the global UNIQUE constraint on `open_sales.invoice_number` with
   a composite UNIQUE on `(shop_id, invoice_number)`.
5. THE DB_Init SHALL replace the global UNIQUE constraint on `closed_sales.invoice_number`
   with a composite UNIQUE on `(shop_id, invoice_number)`.
6. EACH constraint replacement SHALL drop the old constraint with `IF EXISTS` and add the new
   one under a guard that tolerates it already existing, so the statement is idempotent. THE
   guard SHALL catch `duplicate_table` as well as `duplicate_object`: a UNIQUE constraint is
   backed by an index of the same name, and on a re-run it is that index that collides first,
   which `duplicate_object` alone does not catch.
7. EACH constraint replacement SHALL execute only after the backfill and NOT NULL steps for
   that table have completed.

---

### Requirement 5: Invoice numbering gains a real sequence

**User Story:** As a shop owner, I want to be able to change my receipt's invoice prefix
without my numbering restarting at 1, so that a cosmetic change cannot collide with my own
sales history.

#### Acceptance Criteria

1. THE DB_Init SHALL add a nullable `invoice_seq INT` column to `open_sales` and
   `closed_sales`.
2. THE DB_Init SHALL backfill `invoice_seq` on both tables by parsing the existing
   `invoice_number` with the pattern `^INV-([0-9]+)$`, updating only rows WHERE
   `invoice_seq IS NULL`.
3. WHERE an existing `invoice_number` does not match the pattern, THE DB_Init SHALL leave
   `invoice_seq` NULL rather than failing the migration — hand-edited invoice numbers exist
   and `MAX()` ignores NULL, which preserves today's allocation behaviour.
4. THE `invoice_seq` column SHALL remain nullable.
5. THE `invoice_number` column SHALL remain the authoritative display value and SHALL NOT be
   modified by this ticket.

---

### Requirement 6: Indexes reflect the new access pattern

**User Story:** As a developer, I want the indexes to match the queries that ticket 04 will
write, so that adding a shop predicate does not quietly turn every list into a table scan.

#### Acceptance Criteria

1. THE DB_Init SHALL create an index on `open_sales (shop_id, created_at)`.
2. THE DB_Init SHALL create an index on `closed_sales (shop_id, paid_at)`.
3. THE DB_Init SHALL create an index on `closed_sales (shop_id, created_at)`.
4. THE DB_Init SHALL replace the existing `idx_closed_sales_paid_using` index with one on
   `closed_sales (shop_id, paid_using)`.
5. EVERY index SHALL be created with `IF NOT EXISTS`.
6. THE DB_Init SHALL remove the statement that creates `idx_closed_sales_paid_using`. Leaving
   it in place while also dropping the index would create and drop that index on every single
   boot.

---

### Requirement 7: No behavioural change

**User Story:** As the shop owner, I want the till to work exactly as it does today while
this migration is deployed, so that the upgrade is invisible to my staff.

#### Acceptance Criteria

1. THE controllers, routes, middleware and utilities SHALL NOT be modified by this ticket.
2. THE API SHALL expose the same endpoints, accept the same request shapes, and return the
   same response shapes as before this ticket.
3. WHEN this ticket is deployed, THE existing frontend SHALL continue to function without
   modification.
4. THE row count of every Scoped Table SHALL be identical before and after the migration.
5. NO existing column SHALL be dropped, renamed, or have its type changed.
