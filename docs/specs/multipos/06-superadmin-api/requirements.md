# Requirements: Super-Admin API

## Introduction

Everything the super admin can do that no one else can: create and edit shops (including
their receipt profile), create and deactivate users, assign users to shops, and correct the
encoded dates on a sale.

All of it lives under `/api/admin`, on the router ticket 05 created, behind
`requireRealAuth, requireRole("super_admin")`. Every action here is a Transactional Write in
audit terms — low volume, high consequence, and the record must never be lost.

Date correction deserves particular care. It rewrites history: reports bucket sales by
`created_at` and `paid_at`, so moving a date silently changes what past reports say. That is
the intended feature, and it is exactly why it must be audited with complete before/after
values inside the same transaction as the change.

## Glossary

- **Receipt Profile** — the `shops` columns a printed receipt renders.
- **Assignment** — a `user_shops` row.
- **Date Correction** — an edit to `created_at` and/or `paid_at` on an open or closed sale.
- **Deactivation** — setting `is_active = false`, the default meaning of "delete a user".
- **Admin_Router** — `backend/routes/admin.js`, created in ticket 05.

---

## Requirements

### Requirement 1: Shop management

**User Story:** As a super admin, I want to create and edit shops, so that opening a new
branch does not require a developer.

#### Acceptance Criteria

1. THE API SHALL expose `GET /api/admin/shops`, listing every shop including inactive ones.
2. THE API SHALL expose `POST /api/admin/shops`, creating a shop from a name, a slug and the
   Receipt Profile fields.
3. THE API SHALL expose `PUT /api/admin/shops/:id`, updating a shop's name and Receipt
   Profile.
4. THE API SHALL expose `POST /api/admin/shops/:id/deactivate` and a matching reactivate
   route, toggling `is_active`.
5. THE system SHALL NOT provide a route that deletes a shop row, because sales, inventory and
   audit rows reference it.
6. THE `slug` SHALL be immutable after creation.
7. IF a submitted slug is already in use, THEN THE API SHALL respond 409 with a message
   naming the conflict.
8. THE `invoice_prefix` SHALL be editable, and the API SHALL warn in its response when
   changing it on a shop that already has sales.

---

### Requirement 2: A new shop is usable immediately

**User Story:** As a super admin, I want a shop I just created to be ready to take a sale, so
that I am not left with a shop whose pay dialog has no payment methods in it.

#### Acceptance Criteria

1. WHEN a shop is created, THE system SHALL seed it with the default payment methods `cash`
   and `gcash`, scoped to the new shop.
2. THE seeding SHALL happen inside the same transaction as the shop insert.
3. THE system SHALL NOT copy inventory or services from any existing shop.
4. WHEN a shop is created, its invoice sequence SHALL start at 1.

---

### Requirement 3: User management

**User Story:** As a super admin, I want to create accounts for my managers and workers, so
that each person has their own credentials.

#### Acceptance Criteria

1. THE API SHALL expose `GET /api/admin/users`, listing all users with their assignments.
2. THE API SHALL expose `POST /api/admin/users`, creating a user with a username, full name,
   role, initial password and an optional list of shop assignments.
3. THE API SHALL expose `PUT /api/admin/users/:id`, updating full name and role.
4. THE API SHALL expose `POST /api/admin/users/:id/deactivate` and a matching reactivate
   route.
5. THE API SHALL expose `POST /api/admin/users/:id/reset-password`, setting a new password and
   `must_change_password = TRUE`.
6. THE API SHALL expose `PUT /api/admin/users/:id/shops`, replacing a user's assignments.
7. A user created through this API SHALL have `must_change_password = TRUE`.
8. THE API SHALL NEVER return `password_hash` or `token_version`.
9. THE username SHALL be immutable after creation.

---

### Requirement 4: Deactivation is the delete path

**User Story:** As a super admin, I want removing someone's access to preserve what they did,
so that the audit log stays attributable.

#### Acceptance Criteria

1. WHEN a user is deactivated, THE system SHALL set `is_active = false` and bump
   `token_version`, so their outstanding refresh tokens stop working immediately.
2. THE API SHALL expose `DELETE /api/admin/users/:id`, which SHALL permanently remove the row
   ONLY IF that user has no rows in `audit_log`.
3. IF a hard delete is attempted for a user who has audit rows, THEN THE API SHALL respond
   409 with a message explaining that the account can be deactivated instead.
4. THE system SHALL refuse to deactivate or delete the last active `super_admin`.
5. THE system SHALL refuse to let a super admin deactivate or delete their own account.

---

### Requirement 5: Date correction

**User Story:** As a super admin, I want to fix a sale that was encoded with the wrong date,
so that my reports reflect when business actually happened.

#### Acceptance Criteria

1. THE API SHALL expose `PATCH /api/admin/sales/:table/:id/dates`, where `:table` is `open`
   or `closed`.
2. THE endpoint SHALL accept `created_at` and/or `paid_at` and SHALL leave an omitted field
   untouched.
3. IF the resulting `paid_at` would be earlier than the resulting `created_at`, THEN THE API
   SHALL respond 400 and change nothing.
4. THE endpoint SHALL reject a date more than one day in the future.
5. FOR a closed sale, THE endpoint SHALL reject a request that would set `paid_at` to NULL.
6. FOR an open sale, THE endpoint SHALL accept `created_at` only, since an open sale has no
   meaningful `paid_at`.
7. THE endpoint SHALL write a `sale.date_corrected` Audit Event carrying the complete before
   and after values, inside the same transaction as the update.
8. THE endpoint SHALL operate on any shop, subject to the super admin's normal scope rules.
9. THE endpoint SHALL NOT modify `items`, stock, `invoice_number` or `invoice_seq`.

---

### Requirement 6: Everything here is audited transactionally

**User Story:** As a shop owner, I want administrative actions to be impossible to perform
without a record, so that the log can be trusted for exactly the actions that matter most.

#### Acceptance Criteria

1. EVERY mutating endpoint in this ticket SHALL write its Audit Event using the transactional
   path from ticket 05.
2. IF an Audit Event write fails, THEN the subject change SHALL roll back.
3. THE Audit Event for a user or shop change SHALL carry complete before and after values.
4. THE Audit Event SHALL NEVER contain a password or a password hash.

---

### Requirement 7: Scope and access

**User Story:** As a shop owner, I want these endpoints reachable only by a super admin, so
that a manager cannot create accounts.

#### Acceptance Criteria

1. EVERY route in this ticket SHALL sit under `/api/admin` behind
   `requireRealAuth, requireRole("super_admin")`.
2. THE routes SHALL NOT be reachable through the `LEGACY_UNAUTH` bypass.
3. THE routes SHALL NOT use `resolveShop`; they take the shop as an explicit parameter
   because a super admin acts across shops by definition.
4. WHEN a non-super-admin calls any of these routes, THE API SHALL respond 403.
