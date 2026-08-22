# Design: Super-Admin API

## Overview

Three new controllers hanging off the `/api/admin` router that ticket 05 created. No existing
controller changes. No schema changes — tickets 02 and 03 added every column this ticket
writes.

```
backend/
├── routes/admin.js                    ← extended (created in ticket 05)
└── controllers/
    ├── auditController.js             ← from ticket 05
    ├── adminShopsController.js        ← NEW
    ├── adminUsersController.js        ← NEW
    └── adminSalesController.js        ← NEW: date correction only
```

---

## The deliberate exception to the scoping rule

Ticket 04 established a hard rule: **a controller derives scope only from `req.shopId`, never
from the request.** This ticket breaks it, and the break needs to be explicit rather than
discovered later.

`/api/admin` routes do **not** mount `resolveShop`. They take a shop id as an ordinary path or
body parameter, because a super admin acting across shops is the entire point of the surface —
requiring an `X-Shop-Id` header would mean re-selecting a shop to edit a different one.

This is safe only because of the guard above it: every route under `/api/admin` sits behind
`requireRealAuth, requireRole("super_admin")` at the router level, and a super admin is
already authorised for every shop. The parameter therefore selects among things the caller
may already reach; it does not widen anyone's access.

Two consequences to hold on to:

- The rule from ticket 04 is unchanged for every other controller. `rg` for
  `req.body.shop_id` will now return hits, and they must all be under
  `controllers/admin*.js`. Ticket 04's SP1 check should be narrowed to exclude that prefix
  rather than deleted.
- If a route is ever added under `/api/admin` that a *manager* can reach, this reasoning
  collapses. Do not add one. Manager-scoped shop settings belong on a shop-scoped route with
  `resolveShop`, and ticket 09 puts them there.

---

## Components and Interfaces

### `adminShopsController.js`

| Handler | Route |
|---|---|
| `listShops` | `GET /api/admin/shops` |
| `createShop` | `POST /api/admin/shops` |
| `updateShop` | `PUT /api/admin/shops/:id` |
| `setShopActive` | `POST /api/admin/shops/:id/deactivate` \| `/reactivate` |

**Creation seeds payment methods, and this is easy to miss.** The `payment_methods` seed in
`initDB.js:136-159` is guarded on `WHERE NOT EXISTS (SELECT 1 FROM payment_methods)` — it
fires once, on the very first boot, and after ticket 02 those rows belong to Shop 1. A shop
created later gets nothing, and its pay dialog would be empty with no obvious cause.

```js
await sql.transaction([
  sql`INSERT INTO shops (...) VALUES (...) RETURNING id`,
  // seeded in the same transaction: a shop that exists but cannot take a payment
  // is worse than a shop that failed to be created
  sql`INSERT INTO payment_methods (shop_id, code, label, icon, sort_order)
      VALUES (${newId}, 'cash', 'Cash', 'banknote', 1),
             (${newId}, 'gcash', 'GCash', 'smartphone', 2)`,
  auditQuery(req, { action: "shop.create", ... }),
]);
```

Because neon-http needs the new shop's id before the dependent inserts can be written, this
is one place where the id must be allocated first. Take the shop insert as its own statement,
then run the seed and the audit row as a second transaction — or resolve the id with a CTE.
Either is acceptable; what is not acceptable is a shop created without methods.

Inventory and services are deliberately **not** copied from another shop. A new branch starts
empty, and cloning a catalog is a distinct feature with its own questions (prices? stock
levels? sort order?) that nobody has asked for.

`invoice_prefix` is editable, but changing it on a shop that already has sales starts a new
display series over an existing integer sequence. Because ticket 02 decoupled `invoice_seq`
from the string, numbering does not reset — but receipts before and after the change look
unrelated. The response carries a warning field when the shop has sales, so ticket 10's UI can
surface it.

### `adminUsersController.js`

| Handler | Route |
|---|---|
| `listUsers` | `GET /api/admin/users` |
| `createUser` | `POST /api/admin/users` |
| `updateUser` | `PUT /api/admin/users/:id` |
| `setUserActive` | `POST /api/admin/users/:id/deactivate` \| `/reactivate` |
| `resetPassword` | `POST /api/admin/users/:id/reset-password` |
| `setUserShops` | `PUT /api/admin/users/:id/shops` |
| `deleteUser` | `DELETE /api/admin/users/:id` |

Every response goes through the `toPublicUser` helper from ticket 03. `listUsers` returns each
user with their assigned shop ids via a single grouped query rather than N+1:

```sql
SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.must_change_password,
       u.last_login_at,
       COALESCE(ARRAY_AGG(us.shop_id) FILTER (WHERE us.shop_id IS NOT NULL), '{}') AS shop_ids
  FROM users u
  LEFT JOIN user_shops us ON us.user_id = u.id
 GROUP BY u.id
 ORDER BY u.is_active DESC, u.username
```

**Deactivation bumps `token_version`.** Without that, the user's refresh token keeps working
and they simply refresh their way back in. With it, refresh fails on the next attempt and the
outstanding access token dies within the hour — the deactivation lag recorded as R5 in the
overview.

`setUserShops` replaces the whole assignment set in one transaction (delete then insert),
rather than diffing. The set is small, replacement is atomic, and a partial diff failure would
leave a user assigned to a shop nobody chose.

#### Three refusals

```js
// 4.4 — never strand the system with no way in
if (targetIsSuperAdmin && activeSuperAdminCount === 1) refuse(409);

// 4.5 — a super admin locking themselves out mid-session is a support call, not a feature
if (target.id === req.user.id) refuse(409);

// 4.2/4.3 — hard delete only for an account that never acted
if (auditRowCount > 0) refuse(409, "Deactivate this account instead");
```

The last-super-admin check must count *active* super admins and must run inside the same
transaction as the deactivation, or two concurrent requests can each see a count of two and
both proceed.

### `adminSalesController.js` — date correction

`PATCH /api/admin/sales/:table/:id/dates`, where `:table` is validated against an allowlist of
exactly `open` and `closed`. It is used to choose between two literal query branches, never
interpolated — neon tagged templates cannot parameterise an identifier, and this is the one
place in the ticket where a naive implementation would be an injection.

```js
const TABLES = { open: "open_sales", closed: "closed_sales" };
// Two hand-written branches. Do NOT build the table name into a template string.
```

Validation, in order:

1. `:table` is in the allowlist, else 400.
2. The row exists, else 404.
3. Compute the resulting pair: each field is the submitted value if present, otherwise the
   current one.
4. Neither resulting date is more than 24 hours in the future.
5. For a closed sale, the resulting `paid_at` is not NULL.
6. The resulting `paid_at` is not earlier than the resulting `created_at`.

Then the update and its audit row go out as one transaction:

```js
await sql.transaction([
  sql`UPDATE closed_sales SET created_at = ${nextCreated}, paid_at = ${nextPaid}
       WHERE id = ${id} RETURNING *`,
  auditQuery(req, {
    action: "sale.date_corrected",
    entity_type: "closed_sale",
    entity_id: id,
    entity_label: sale.invoice_number,
    changes: { before: { created_at, paid_at }, after: { created_at: nextCreated, paid_at: nextPaid } },
  }),
]);
```

**Why this one is transactional while a sale creation is not.** A missing audit row for a
routine sale costs a line in a log. A missing audit row for a backdated sale removes the only
evidence that history was rewritten — which is the entire reason the feature is restricted to
super admins. Requirement 5.7 is not a formality.

Nothing else is touched: not `items`, not stock, not `invoice_number`, not `invoice_seq`.
Moving a date does not move a sale between tables, so the paid/unpaid distinction is
unaffected.

---

## Data Models

No schema changes.

One behavioural note worth writing down: `open_sales.paid_at` exists but is NULL in normal
operation — `paySale` moves the row to `closed_sales` rather than stamping it. So Requirement
5.6 restricting open-sale corrections to `created_at` is not an arbitrary limitation; it
matches what the column actually means.

---

## Error Handling

| Condition | Status | Body |
|---|---|---|
| Non-super-admin | 403 | From the router-level guard |
| Unauthenticated, even with `LEGACY_UNAUTH=true` | 401 | `requireRealAuth` has no bypass |
| Slug already in use | 409 | `{ message: "That shop slug is already taken" }` |
| Username already in use | 409 | `{ message: "That username is already taken" }` |
| Password under 8 characters | 400 | From `assertPasswordPolicy` |
| Deactivating the last active super admin | 409 | `{ message: "There must be at least one active super admin" }` |
| Deactivating or deleting yourself | 409 | `{ message: "You cannot deactivate your own account" }` |
| Hard-deleting a user with audit rows | 409 | `{ message: "This account has activity. Deactivate it instead." }` |
| `:table` not `open` or `closed` | 400 | `{ message: "Unknown sale type" }` |
| Resulting `paid_at` before `created_at` | 400 | `{ message: "A sale cannot be paid before it was created" }` |
| Date more than a day in the future | 400 | `{ message: "That date is in the future" }` |
| Sale not found | 404 | `{ message: "Sale not found" }` |
| Transactional audit write fails | 500 | Whole operation rolls back |

---

## Correctness Properties

### P1 — Date validation is symmetric under partial input

For any existing `(created_at, paid_at)` pair and any partial patch, the validator's verdict
depends only on the *resulting* pair, never on which of the two fields was submitted.

*Validates: 5.2, 5.3*

### P2 — The ordering rule is never violated

For any accepted correction, the resulting `paid_at` is either NULL or greater than or equal
to the resulting `created_at`.

*Validates: 5.3*

### P3 — Table selection is closed

For any string that is not exactly `open` or `closed`, the handler rejects before building any
query.

*Validates: 5.1*

### P4 — Public user shape never leaks

For any user row, including one carrying extra columns, `toPublicUser` returns an object with
no `password_hash` and no `token_version` key.

*Validates: 3.8, 6.4*

### Structural property SP1 — the scoping exception is contained

```powershell
rg -n "req\.(body|query|params)\.(shop_id|shopId)" backend/controllers/ | rg -v "controllers/admin"
```
returns nothing — the ticket-04 rule still holds everywhere except the admin controllers.

*Validates: 7.3*

---

## Testing Strategy

### Unit and property tests

- `adminSalesController` date validation extracted into a pure helper
  (`utils/dateCorrection.js`) so P1, P2 and P3 can be tested without a database. This is the
  same pattern the codebase already uses for `saleItems.js` and `reorder.js` — keep the
  validation pure and the controller thin.
- P4 against `toPublicUser` from ticket 03.

### Integration checks

| Scenario | Expected |
|---|---|
| Create a shop | 201; the shop has exactly two payment methods, `cash` and `gcash`, scoped to it |
| Take a sale at the new shop | Invoice number is the shop's prefix + `0001` |
| Create a shop with a duplicate slug | 409 |
| Update a shop's `invoice_prefix` where sales exist | 200 with a warning field present |
| Create a user with two assignments | 201; `must_change_password` true; no `password_hash` in the response |
| That user logs in | Their shop list contains exactly the two assigned shops |
| Reassign them to one shop, then they refresh | The new access token carries one shop |
| Deactivate them | Their refresh immediately 401s |
| Deactivate the only active super admin | 409 |
| A super admin deactivates themselves | 409 |
| Hard-delete a user who has taken a sale | 409 naming deactivation |
| Hard-delete a freshly created user who has never acted | 204 |
| Correct a closed sale's `created_at` backwards | 200; a `sale.date_corrected` audit row holds full before/after |
| Correct `paid_at` to before `created_at` | 400; the row is unchanged |
| Correct a date to next week | 400 |
| `PATCH /api/admin/sales/users/1/dates` | 400 from the table allowlist |
| Manager calls any admin route | 403 |
| Break the audit insert, then correct a date | 500 **and the date is unchanged** |

The last row is the counterpart to ticket 05's "the sale still succeeds" check, and it must
come out the opposite way. Confirming both is what proves the two write modes are actually
different rather than nominally different.

### Reporting impact

After correcting a sale's date across a month boundary, reload `/reporting` for both months
and confirm the sale moved. This is the intended behaviour and should be seen working — R4 in
the overview is about making sure nobody is surprised by it, not about preventing it.
