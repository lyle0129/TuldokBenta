# Requirements: Shop Picker & Shop-Scoped Cache

> **Changed by ticket 07.** `X-Shop-Id` already exists. Ticket 07 could not avoid sending it
> — `resolveShop` answers `400 No shop selected` to any authenticated request that omits it,
> because its Shop 1 fallback fires only for the tokenless legacy actor. `apiRequest`
> therefore sends the **lowest id** in the session's shop list, marked in `api.js` as a
> stopgap. This ticket replaces that choice with the picker; it does not introduce the header.

## Introduction

Ticket 07 gave the frontend an identity. This ticket gives it a shop: an active-shop
selection, the `X-Shop-Id` header on every request, and a shop dimension on every query key so
that switching shops cannot serve the previous shop's rows.

That last part is the substance. TanStack Query's cache is persisted to `localStorage` under
`tb_query_cache` for 24 hours, and the current keys — `["inventory"]`, `["services"]`,
`["closedSales", …]` — carry no tenant. Without a shop dimension, switching shops would show
the previous shop's inventory, and a reload would restore it from disk.

## Glossary

- **Active Shop** — the shop the UI is currently acting on. One at a time.
- **Shop Picker** — the control for changing it.
- **Scoped Key** — a TanStack Query key carrying the active shop's id.
- **Assigned Shops** — the shops in the session, from the login response.

---

## Requirements

### Requirement 1: Choosing a shop

**User Story:** As a manager who runs two branches, I want to pick which branch I am working
on, so that one login covers both without mixing them up.

#### Acceptance Criteria

1. THE app SHALL persist the Active Shop's id to `localStorage` alongside the session.
2. WHEN a user signs in and has exactly one assigned shop, THE app SHALL select it
   automatically and SHALL NOT prompt.
3. WHEN a user signs in and has more than one assigned shop, THE app SHALL restore their
   previously selected shop if it is still assigned, and otherwise prompt them to choose
   before showing the till.
4. WHEN a user signs in and has no assigned shops, THE app SHALL show an explanatory screen
   telling them to contact their administrator, and SHALL NOT show an empty till.
5. THE Active Shop SHALL be cleared on sign-out.
6. IF the persisted Active Shop is no longer in the user's Assigned Shops, THEN THE app SHALL
   discard it and fall back to the rules above.

### Requirement 2: Super admins can reach every shop

**User Story:** As a super admin, I want to work in any shop, so that I can support a branch
without assigning myself to it.

#### Acceptance Criteria

1. WHEN the signed-in user is a `super_admin`, THE Shop Picker SHALL list every active shop.
2. THE list of shops for a super admin SHALL be fetched from the API rather than read from the
   session, so a shop created after sign-in appears without a re-login.
3. FOR every other role, THE Shop Picker SHALL list exactly the Assigned Shops from the
   session.

### Requirement 3: The header

**User Story:** As a developer, I want the shop travelling with every request automatically,
so that no call site can forget it.

#### Acceptance Criteria

1. THE `apiRequest` wrapper SHALL attach `X-Shop-Id: <active shop id>` to every request when
   an Active Shop is selected.
2. THE wrapper SHALL NOT attach the header to `/auth/*` or `/admin/*` requests.
3. WHEN no Active Shop is selected, THE app SHALL NOT issue shop-scoped requests at all.
4. IF the API responds 403 because the shop is not assigned, THEN THE app SHALL clear the
   Active Shop and return the user to the picker.

### Requirement 4: Every cached query is scoped

**User Story:** As a manager switching branches, I want the numbers on screen to be the branch
I selected, so that I never act on the wrong shop's data.

#### Acceptance Criteria

1. EVERY entry in `queryKeys` SHALL carry the active shop's id.
2. THE resource name SHALL remain the first element of every key, so that the existing
   prefix-based invalidation and the persisted-resource filter continue to work unchanged.
3. WHEN the Active Shop changes, THE app SHALL clear the in-memory and persisted query caches
   before the new shop's data is fetched.
4. NO query SHALL be issued with a key that omits the shop dimension.
5. THE `nextInvoice` query SHALL be scoped, since invoice series are per shop.

### Requirement 5: The picker in the UI

**User Story:** As a cashier, I want to see which shop I am ringing sales into, so that I
notice immediately if it is the wrong one.

#### Acceptance Criteria

1. THE Active Shop's name SHALL be visible on every page.
2. THE Shop Picker SHALL be reachable from both the desktop navigation and the mobile drawer.
3. WHEN a user has access to exactly one shop, THE app SHALL display its name but SHALL NOT
   render a control implying a choice.
4. WHEN the Active Shop changes, THE app SHALL confirm the change if there is an in-progress
   cart, so that a switch cannot silently discard a partly-built sale.

### Requirement 6: No behavioural change within a shop

**User Story:** As the shop owner, I want everything to work exactly as before for a user with
one shop, so that most of my staff notice nothing.

#### Acceptance Criteria

1. FOR a user with a single assigned shop, THE app SHALL behave exactly as it did after ticket
   07, aside from the added header.
2. THE existing staleness and persistence settings in `src/queryClient.js` SHALL be preserved,
   including the deliberate exclusion of `openSales` from the persisted cache.
3. THE reporting figures SHALL be unchanged for a given shop.
