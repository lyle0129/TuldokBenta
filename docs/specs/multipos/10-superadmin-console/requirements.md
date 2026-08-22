# Requirements: Super-Admin Console

## Introduction

The UI for everything ticket 06 exposed: managing shops, managing users and their assignments,
reviewing the audit log, and correcting the encoded dates on a sale.

The audit viewer carries a design constraint the other screens do not. The log is the one
table in the system that grows without bound, and ticket 05 made its endpoint deliberately
awkward — range required, 100 rows maximum, keyset pagination. The UI must work *with* that
rather than papering over it, because a viewer that quietly requests everything defeats the
whole cost discipline.

## Glossary

- **Console** — the super-admin-only section of the app.
- **Audit Viewer** — the screen for reading the audit log.
- **Date Correction** — editing `created_at` and/or `paid_at` on a sale.

---

## Requirements

### Requirement 1: Console access

**User Story:** As a super admin, I want my administrative screens in one place, so that
day-to-day till work is not cluttered with them.

#### Acceptance Criteria

1. THE Console routes SHALL be restricted to `super_admin`.
2. THE Console SHALL appear in the navigation as its own group, visible only to a
   `super_admin`.
3. THE Console SHALL contain screens for shops, users and the Audit Viewer.
4. THE Console screens SHALL NOT send the `X-Shop-Id` header, since they act across shops.

---

### Requirement 2: Shop management

**User Story:** As a super admin, I want to create and edit shops, so that opening a branch is
something I can do myself.

#### Acceptance Criteria

1. THE shops screen SHALL list every shop with its name, slug and active state.
2. THE screen SHALL provide creation with name, slug and the Receipt Profile fields.
3. THE screen SHALL provide editing of a shop's name and Receipt Profile, with `slug` shown
   read-only.
4. THE screen SHALL provide deactivate and reactivate actions.
5. THE screen SHALL NOT offer a delete action.
6. WHEN a shop is created, THE screen SHALL state that it starts with default payment methods
   and an empty catalog.
7. WHEN `invoice_prefix` is edited on a shop with existing sales, THE screen SHALL show the
   warning returned by the API before saving.

---

### Requirement 3: User management

**User Story:** As a super admin, I want to create accounts and say which shops each person
works at, so that staff can sign in.

#### Acceptance Criteria

1. THE users screen SHALL list every user with their full name, username, role, active state
   and assigned shops.
2. THE screen SHALL provide creation with username, full name, role, initial password and shop
   assignments.
3. THE screen SHALL provide editing of full name and role, with `username` shown read-only.
4. THE screen SHALL provide a shop-assignment editor.
5. THE screen SHALL provide a password reset that sets a new password and forces a change at
   next sign-in.
6. THE primary removal action SHALL be labelled **Deactivate**, not Delete.
7. THE screen SHALL offer a permanent delete only for an account with no recorded activity, and
   SHALL explain why it is unavailable otherwise.
8. WHEN the API refuses an action — last super admin, self-deactivation, delete with activity —
   THE screen SHALL show the server's explanation.
9. THE screen SHALL NEVER display a password hash.
10. WHEN an initial or reset password is set, THE screen SHALL show it once so it can be handed
    over, and SHALL make clear it will not be shown again.

---

### Requirement 4: The audit viewer

**User Story:** As a super admin, I want to see who did what and when, so that I can answer a
question about my shops without opening the database.

#### Acceptance Criteria

1. THE Audit Viewer SHALL require a date range before issuing any request, defaulting to today.
2. THE Audit Viewer SHALL NOT provide an "all time" option.
3. THE Audit Viewer SHALL request at most 100 rows at a time and SHALL page using the cursor
   the API returns.
4. THE Audit Viewer SHALL offer filters for shop, actor and action, populated from the API's
   available-actions response rather than from a hardcoded list.
5. THE Audit Viewer SHALL display each event's time, actor, role, shop, action, entity label
   and changes.
6. THE `changes` payload SHALL be rendered readably, not as raw JSON.
7. THE Audit Viewer SHALL NOT poll, auto-refresh, or prefetch the next page.
8. THE Audit Viewer's results SHALL NOT be written to the persisted query cache.
9. WHEN a range returns no events, THE Audit Viewer SHALL say so plainly.

---

### Requirement 5: Date correction

**User Story:** As a super admin, I want to fix a sale encoded on the wrong date, so that my
reports reflect when business actually happened.

#### Acceptance Criteria

1. THE app SHALL offer a Date Correction action on closed-sale and open-sale rows, visible only
   to a `super_admin`.
2. THE action SHALL open a dialog pre-filled with the sale's current dates.
3. FOR an open sale, THE dialog SHALL offer `created_at` only.
4. THE dialog SHALL state, before confirmation, that changing the date changes what past
   reports show.
5. WHEN the API rejects the change, THE dialog SHALL show the server's message and leave the
   dialog open.
6. WHEN the change succeeds, THE app SHALL invalidate the affected sales queries so the list
   reflects the new date.
7. THE dialog SHALL be reachable from where sales are listed, not only from the Console.

---

### Requirement 6: Consistency with the existing UI

**User Story:** As a super admin, I want these screens to feel like the rest of the app, so
that they are not a separate product.

#### Acceptance Criteria

1. THE Console screens SHALL follow the structure of the existing management pages —
   `pages/PaymentMethods.jsx` and its list and modal components are the closest template.
2. THE screens SHALL support the existing dark mode.
3. THE screens SHALL be usable on a phone, consistent with the rest of the app.
