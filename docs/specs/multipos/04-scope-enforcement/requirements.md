# Requirements: Enforce Auth & Shop Scope Across the Existing API

## Introduction

Tickets 02 and 03 built the parts: every table has a `shop_id`, and the backend can identify
an actor and resolve a shop. Nothing uses either yet. This ticket connects them.

Every existing route gains `requireAuth` and, where it touches shop data, `resolveShop` and a
role guard. Every existing SQL statement gains a shop predicate. Invoice allocation becomes
per-shop and starts using the `invoice_seq` column added in ticket 02.

This is the largest ticket in the program — roughly 46 SQL statements across six files — and
the one whose failure mode is worst, because an unscoped query does not error. It returns the
wrong shop's data, or writes to it. There is no test that catches "I forgot a WHERE clause"
in general; only a statement-by-statement pass does.

The `LEGACY_UNAUTH` bypass from ticket 03 is what keeps the deployed frontend working through
this change: with the flag on, a tokenless request still resolves to a manager on Shop 1, and
every newly-added predicate evaluates to exactly the rows it returns today.

## Glossary

- **Scoped Statement** — a SQL statement that reads or writes a Scoped Table and therefore
  requires a `shop_id` predicate.
- **Trusted Scope** — `req.shopId`, set by `resolveShop`. The only value a controller may
  scope a query by.
- **Catalog Read** — `GET /api/inventory`, `GET /api/services`, `GET /api/payment-methods`.
  Worker-accessible because the till renders from them.
- **Invoice Allocation** — choosing the next `invoice_seq` and rendering it into an
  `invoice_number` using the shop's prefix.

---

## Requirements

### Requirement 1: Every route is authenticated

**User Story:** As a shop owner, I want the API to refuse anonymous requests, so that knowing
the backend URL is no longer enough to read or change my data.

#### Acceptance Criteria

1. THE Server SHALL mount `requireAuth` on every route under `/api` except `/api/health` and
   the `/api/auth` routes.
2. THE Server SHALL mount `resolveShop` on every route that reads or writes a Scoped Table.
3. WHEN a request reaches a controller, THE controller SHALL be able to rely on `req.user` and
   `req.shopId` both being populated.
4. THE `/api/health` endpoint SHALL remain reachable without authentication, so that the
   keep-alive cron in `config/cron.js` continues to work.

---

### Requirement 2: Role enforcement matches the permission matrix

**User Story:** As a shop owner, I want a worker to be able to run the till but not change my
prices, so that the roles mean something.

#### Acceptance Criteria

1. THE Server SHALL enforce the permission matrix defined in [the overview](../00-overview.md),
   which is the single normative source and SHALL NOT be restated in this ticket.
2. THE Catalog Reads SHALL be accessible to `worker`, `manager` and `super_admin`.
3. THE write routes for inventory, services and payment methods SHALL be restricted to
   `manager` and `super_admin`.
4. THE open-sales routes, the pay route, the revert route and all closed-sales routes SHALL be
   accessible to all three roles.
5. THE role guard SHALL be applied per route, NOT per router, because `/api/inventory` has a
   worker-readable `GET` alongside manager-only writes.
6. WHEN a role guard rejects a request, THE Server SHALL respond 403 without executing any
   query.

---

### Requirement 3: Every scoped statement carries a shop predicate

**User Story:** As a shop owner opening a second branch, I want each branch's data to be
completely invisible to the other, so that stock, sales and prices never cross.

#### Acceptance Criteria

1. EVERY SELECT against a Scoped Table SHALL filter on `shop_id = req.shopId`.
2. EVERY INSERT into a Scoped Table SHALL set `shop_id` to `req.shopId`.
3. EVERY UPDATE and DELETE against a Scoped Table SHALL include `shop_id = req.shopId` in its
   WHERE clause, in addition to any `id` predicate.
4. THE controllers SHALL derive scope only from `req.shopId` and SHALL NOT read a shop
   identifier from `req.body`, `req.query` or `req.params`.
5. THE stock-adjustment statements that match inventory by `item_name` SHALL include the shop
   predicate, so that one shop's sale cannot decrement another shop's stock.
6. THE `MAX(sort_order) + 1` subqueries used when inserting inventory items, services and
   payment methods SHALL be scoped, so a new shop's first item starts at 1.
7. THE `usage_count` subquery in the payment-methods listing SHALL be scoped on both the
   outer and the inner side.
8. WHEN a request names an `id` that exists but belongs to another shop, THE controller SHALL
   respond 404, not 403 — the row's existence is not the requester's business.
9. ONCE every INSERT sets `shop_id` explicitly, THE DB_Init SHALL drop the temporary `shop_id`
   column defaults added by ticket 02 (its Requirements 3.8 and 3.9), so that a statement which
   omits its shop fails loudly instead of silently landing in the first shop.

---

### Requirement 4: Invoice allocation is per shop

**User Story:** As a super admin, I want each shop to run its own invoice series, so that two
shops issuing their first sale on the same day both start from their own numbering.

#### Acceptance Criteria

1. THE Invoice Allocation SHALL derive the next sequence from `MAX(invoice_seq)` across both
   sale tables **for the requested shop only**.
2. THE Invoice Allocation SHALL render the sequence into an `invoice_number` using the
   requesting shop's `invoice_prefix`.
3. THE INSERT into `open_sales` SHALL populate both `invoice_number` and `invoice_seq`.
4. THE existing shop's numbering SHALL continue from its current maximum and SHALL NOT restart.
5. THE `isInvoiceTaken` check SHALL be scoped to the requesting shop.
6. WHEN a caller supplies an `invoice_number` that is free within the requesting shop, THE
   system SHALL honour it, preserving the offline queue's existing behaviour.
7. WHEN a supplied `invoice_number` is already taken within the requesting shop, THE system
   SHALL reassign and set `invoice_reassigned` in the response, exactly as it does today.
8. IF a supplied `invoice_number` does not parse as the shop's prefix followed by digits,
   THEN THE system SHALL store NULL in `invoice_seq` rather than rejecting the sale.
9. THE retry-on-unique-violation loop SHALL continue to function, now keyed on the composite
   `(shop_id, invoice_number)` constraint.

---

### Requirement 5: Sale movement between tables preserves scope

**User Story:** As a developer, I want paying and reverting a sale to keep it in its own shop,
so that the one operation that copies rows between tables cannot lose the tenant.

#### Acceptance Criteria

1. WHEN a sale is paid, THE INSERT into `closed_sales` SHALL carry the `shop_id` and
   `invoice_seq` of the originating open sale.
2. WHEN a sale is reverted, THE INSERT into `open_sales` SHALL carry the `shop_id` and
   `invoice_seq` of the originating closed sale.
3. THE SELECT that loads the sale before either move SHALL be scoped, so a sale from another
   shop cannot be paid or reverted.
4. THE DELETE half of each move SHALL be scoped.
5. BOTH halves SHALL remain inside the existing `sql.transaction([...])` batch.

---

### Requirement 6: The payment-method check is scoped

**User Story:** As a shop owner, I want my payment methods to be mine, so that deactivating
GCash at one branch does not depend on another branch's settings.

#### Acceptance Criteria

1. THE active-method check performed when paying a sale SHALL be scoped to the requesting
   shop.
2. THE active-method check performed when editing a closed sale SHALL be scoped to the
   requesting shop.
3. THE shared `assertMethodActive` helper SHALL continue to be used by both paths so they
   cannot drift.

---

### Requirement 7: The legacy window keeps the old frontend working

**User Story:** As an operator, I want to deploy this ticket without downtime, so that the
shop keeps trading while the frontend catches up.

#### Acceptance Criteria

1. WHEN `LEGACY_UNAUTH` is enabled, THE existing frontend SHALL continue to function against
   this backend without modification.
2. WHEN `LEGACY_UNAUTH` is enabled AND a request arrives with no token, THE request SHALL be
   scoped to `LEGACY_SHOP_ID` and SHALL return exactly the rows it returns today.
3. WHEN `LEGACY_UNAUTH` is disabled, THE same request SHALL receive 401.
4. NO controller SHALL contain any reference to the legacy flag.

---

### Requirement 8: Behaviour is otherwise unchanged

**User Story:** As the shop owner, I want everything the till does today to work identically
afterwards, so that the only observable difference is that it now requires a login.

#### Acceptance Criteria

1. THE endpoints SHALL keep their existing HTTP methods, paths, request shapes and response
   shapes.
2. THE stock reconciliation behaviour — deduct on create, net delta on update, restock on
   delete — SHALL be preserved exactly.
3. THE atomicity guarantees provided by the existing `sql.transaction([...])` batches SHALL be
   preserved.
4. THE existing error statuses and messages SHALL be preserved, with 401 and 403 added.
5. THE pure utility modules `utils/saleItems.js`, `utils/paymentMethods.js` and
   `utils/reorder.js` SHALL NOT require modification, since they operate on rows passed to
   them rather than reaching for the database.
