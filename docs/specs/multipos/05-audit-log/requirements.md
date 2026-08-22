# Requirements: Audit Log

## Introduction

With real accounts in place, every change can be attributed to a person. This ticket records
that attribution in an append-only `audit_log` table, and exposes a super-admin-only endpoint
for reading it.

The explicit constraint on this design is **cost**. An audit table grows without bound and is
read rarely, so it must never appear in a query on any path the till depends on. Every
requirement below that looks like a restriction on the read endpoint is there for that reason.

## Glossary

- **Audit Event** — one append-only row describing one mutation or one auth event.
- **Actor Snapshot** — the `actor_username` and `actor_role` copied onto the event at write
  time, so a deactivated or renamed account still reads correctly in the log.
- **Best-effort Write** — an audit write that is attempted after its subject transaction has
  committed, and whose failure is logged rather than raised.
- **Transactional Write** — an audit write batched into the same `sql.transaction([...])` as
  its subject, so the change and its record land together or not at all.
- **Audit_Module** — `backend/utils/audit.js`.

---

## Requirements

### Requirement 1: The `audit_log` table

**User Story:** As a super admin, I want a durable record of who changed what, so that I can
answer questions about my shops after the fact.

#### Acceptance Criteria

1. THE DB_Init SHALL create an `audit_log` table if it does not exist, with `id`,
   `occurred_at`, `actor_user_id`, `actor_username`, `actor_role`, `shop_id`, `action`,
   `entity_type`, `entity_id`, `entity_label`, `changes` and `ip_address`.
2. THE `audit_log.id` column SHALL be a `BIGSERIAL`, since this table grows faster than any
   other in the system.
3. THE `audit_log.actor_user_id` SHALL be a nullable foreign key to `users(id)`, and
   `audit_log.shop_id` a nullable foreign key to `shops(id)` — global actions have no shop.
4. THE `audit_log.actor_username` and `actor_role` columns SHALL hold an Actor Snapshot taken
   at write time, and SHALL NOT be resolved by joining `users` at read time.
5. THE table SHALL be append-only in practice: no code path other than the retention sweep
   SHALL update or delete a row.
6. THE DB_Init SHALL create indexes on `(shop_id, occurred_at DESC)`,
   `(actor_user_id, occurred_at DESC)` and `(action, occurred_at DESC)`.

---

### Requirement 2: What gets recorded

**User Story:** As a super admin, I want every meaningful change and every sign-in recorded,
so that the log is complete enough to be trusted.

#### Acceptance Criteria

1. THE system SHALL record an Audit Event for every sale mutation: create, update, delete,
   pay and revert.
2. THE system SHALL record an Audit Event for every catalog mutation: inventory and services
   create, update, restock, delete and reorder; payment-method create, update, delete and
   reorder.
3. THE system SHALL record an Audit Event for successful login, failed login, logout and
   password change.
4. THE system SHALL record an Audit Event for every super-admin action added in ticket 06:
   shop create and update, user create, update and deactivate, assignment change, and date
   correction.
5. THE system SHALL NOT record read operations, page views or navigation.
6. THE `action` value SHALL follow a `domain.verb` convention, for example `sale.pay`,
   `inventory.restock`, `auth.login_failed`, `user.deactivate`.

---

### Requirement 3: What each event stores

**User Story:** As a super admin, I want enough detail to understand an entry without opening
the database, but not so much that the table becomes the largest thing I own.

#### Acceptance Criteria

1. EVERY Audit Event SHALL carry an `entity_label` that is human-readable without a join —
   an invoice number, an item name, a username.
2. FOR a high-volume create event, THE `changes` column SHALL store a compact summary rather
   than the full payload — for a sale, the invoice number, the line count and the total.
3. FOR an update event, THE `changes` column SHALL store `{ before, after }` containing only
   the fields that actually changed.
4. FOR a date correction, a user management action or a shop management action, THE `changes`
   column SHALL store the complete before and after values of every field touched.
5. THE `changes` column SHALL NOT store a password, a password hash, or a token.
6. THE system SHALL record the client IP when it is available.

---

### Requirement 4: Writes must never break the till

**User Story:** As a cashier, I want a sale to complete even if the audit system is having a
bad day, so that a logging problem never costs the shop a transaction.

#### Acceptance Criteria

1. THE sale-flow and catalog Audit Events SHALL be Best-effort Writes, performed after the
   subject transaction has committed.
2. IF a Best-effort Write fails, THEN THE system SHALL log the failure to the console and
   SHALL return the successful response for the original operation.
3. THE super-admin Audit Events — date correction, user management and shop management —
   SHALL be Transactional Writes.
4. IF a Transactional Write fails, THEN the entire subject operation SHALL roll back.
5. THE Audit_Module SHALL NOT be able to throw into a controller's success path.

---

### Requirement 5: Reading the log is bounded by construction

**User Story:** As a super admin, I want to review activity without any risk of a single query
tying up the database.

#### Acceptance Criteria

1. THE API SHALL expose `GET /api/admin/audit`, restricted to `super_admin`.
2. THE read endpoint SHALL require an explicit date range and SHALL reject a request without
   one rather than defaulting to all time.
3. THE read endpoint SHALL cap the returned row count at 100 per request.
4. THE read endpoint SHALL paginate by keyset on `(occurred_at, id)` and SHALL NOT use
   `OFFSET`.
5. THE read endpoint SHALL accept optional filters for shop, actor, action and entity type.
6. THE read endpoint SHALL return the Actor Snapshot stored on the row and SHALL NOT join
   `users` or `shops`.
7. NO other endpoint in the system SHALL read from `audit_log`.
8. THE read endpoint SHALL expose the distinct `action` values available in the requested
   range, so a client can build a filter without a second table.

---

### Requirement 6: Retention

**User Story:** As an operator, I want the table to stop growing eventually, so that it does
not become the dominant cost of running the system.

#### Acceptance Criteria

1. THE system SHALL provide a retention sweep deleting Audit Events older than a configured
   age, defaulting to 18 months.
2. THE retention sweep SHALL be disabled unless explicitly enabled by configuration.
3. THE retention sweep SHALL run at most once per day.
4. THE retention sweep SHALL delete in bounded batches rather than as one unbounded statement.

---

### Requirement 7: No behavioural change

**User Story:** As the shop owner, I want the till to behave exactly as it did before this
ticket, so that adding an audit trail is invisible to my staff.

#### Acceptance Criteria

1. THE existing endpoints SHALL keep their methods, paths, request shapes and response shapes.
2. THE latency of a sale operation SHALL not depend on the audit write completing.
3. THE scoping rules established in ticket 04 SHALL be preserved without modification.
