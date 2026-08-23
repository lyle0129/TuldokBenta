# Implementation Plan: Shop Picker & Shop-Scoped Cache

## Overview

The header, the keys and the picker land together. Shipping the header without the scoped keys
would serve one shop's data under another shop's cache entry — the worst partial state, and a
silent one. Do tasks 2–5 before task 8.

## Tasks

- [x] 1. Add the active-shop key to storage
  - `ACTIVE_SHOP_KEY = "tb_active_shop"` in `src/utils/storage.js`
  - Store it **separately** from `tb_session`, so a token refresh rewriting the session cannot
    drop the shop selection
  - _Requirements: 1.1_

- [x] 2. Extend `src/utils/session.js` with active-shop state
  - `getActiveShopId`, `setActiveShopId`, `clearActiveShop`
  - Reuse the existing listener set so one `useSyncExternalStore` subscription covers both
    session and shop changes
  - `clearSession` also clears the active shop
  - Keep the module-level caching discipline from ticket 07 — the snapshot must be a stable
    reference between changes
  - _Requirements: 1.1, 1.5_

- [x] 3. Rewrite `queryKeys` in `src/queryClient.js`
  - Every entry becomes a function taking `shopId` as its first argument
  - **Keep the resource name at index 0.** Moving it breaks
    `shouldDehydrateQuery`'s `PERSISTED_RESOURCES.includes(query.queryKey[0])` check — which
    fails silently as a blank first paint rather than as an error — and breaks the deliberate
    `["closedSales"]` prefix sharing the existing comment calls out
  - Leave `staleTimes`, `PERSISTED_RESOURCES` and `persistOptions` otherwise untouched,
    including the deliberate exclusion of `openSales`
  - _Requirements: 4.1, 4.2, 4.5, 6.2_

- [x] 4. Add `__tests__/queryKeys.test.js`
  - Properties P1–P4 with `fast-check`: every key carries the shop; index 0 stays a resource
    name; the three closed-sales keys share a two-element prefix; distinct shops never collide
  - _Requirements: 4.1, 4.2_

- [x] 5. Thread `shopId` through every hook
  - `useSales.js`, `useInventory.js`, `useServices.js`, `usePaymentMethods.js`,
    `useOfflineCatalog.js`
  - Every shop-scoped query gets `enabled: Boolean(shopId)`. Without it a query fires with
    `undefined` in its key and no header, takes whatever the backend's legacy fallback returns,
    and caches it under a key nothing will ever invalidate
  - Every `invalidateQueries` call gets the same shop dimension as the query it invalidates
  - _Requirements: 3.3, 4.1, 4.4_

- [x] 6. Create `src/hooks/useActiveShop.js`
  - Returns `{ shopId, shop, shops, setShop }`
  - `setShop` **clears the cache first, then writes the id** — setting first lets in-flight
    queries from the old shop resolve into the new shop's keys
  - Reuse the existing `clearQueryCache()` rather than reimplementing it
  - Discard a persisted shop id that is not in the available list
  - _Requirements: 1.3, 1.6, 4.3_

- [x] 7. Add the super admin's shop list
  - For `super_admin`, fetch the shop list from the API rather than reading the session, so a
    shop created in ticket 10's console is switchable without signing out
  - Every other role reads `session.shops` and issues no request
  - On a failed fetch, fall back to the session's shops with a warning
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 8. Attach `X-Shop-Id` in `src/api.js`
  - Attach when an active shop is set; skip for `/auth/*` and `/admin/*` — the admin routes do
    not mount `resolveShop` and take the shop as an explicit parameter instead
  - On a 403 whose message indicates an unassigned shop, clear the active shop and route to
    the picker
  - _Requirements: 3.1, 3.2, 3.4_

- [x] 9. Create `src/pages/SelectShop.jsx`
  - Two branches: a chooser when the user has several shops and no valid stored selection, and
    an explanatory screen when they have none
  - Build the second branch properly — an unassigned worker otherwise lands on a till with an
    empty catalog and no explanation of why
  - _Requirements: 1.3, 1.4_

- [x] 10. Create `ShopPicker.jsx` and render it
  - Dropdown in the navbar's left cluster, replacing the hardcoded `Spincredible` wordmark at
    `Navbar.jsx`, and a row at the top of `NavDrawer.jsx` under its header — both files
    hardcode that wordmark today
  - With exactly one available shop, render the name as plain text, not a control
  - Confirm before switching when a cart has lines. The cart lives in `useCart` state inside
    `OpenSales.jsx`, so the picker cannot inspect it directly — a small module-level
    "cart is dirty" flag that `useCart` sets and the picker reads is the least invasive route
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 11. Gate the app on having a shop
  - Route to `/select-shop` when signed in with no valid active shop
  - Auto-select when the user has exactly one assigned shop; never prompt in that case
  - _Requirements: 1.2, 1.3, 1.4_

- [x] 12. Run the structural check
  - `rg -n "queryKey:\s*\[" src` returns nothing — every key comes from a `queryKeys`
    function, never a literal array
  - _Requirements: 4.4_

- [ ] 13. Verification checkpoint
  - `npm run build`, `npm test` and `npm run lint` pass
  - Walk the manual table from the design with two shops, a two-shop manager and a one-shop
    worker
  - **Do not skip the two silent checks**: reloading while on Shop B restores B's data and not
    A's, and `tb_query_cache` in `localStorage` holds one shop's data rather than both. A wrong
    key shape looks like ordinary staleness and will not announce itself
  - Confirm a single-shop worker's experience is unchanged from ticket 07 apart from the header
  - Confirm each shop issues its own invoice series
  - Ask the user if any questions arise before closing out

## Notes

- Clearing the cache on every switch costs a refetch. That is the intended trade: managers
  switch a few times a day, and the alternative is an unbounded `localStorage` cache holding
  several shops' sales history on a shared terminal.
- Ticket 09 adds the shop's receipt profile as another scoped query and puts it in
  `PERSISTED_RESOURCES`. Leave that file's persistence list alone here beyond the key reshape.

## As built

Two choices worth recording, both settled during implementation:

- **The super admin's list comes from `GET /auth/me`, not `GET /admin/shops`.** `/auth/me`
  already returns `{ user, shops }` in exactly the picker's shape, and `shopsForUser` already
  resolves a super admin's shops to *every active shop* — the same rule `resolveShop` enforces,
  so the picker cannot offer a shop the middleware would then refuse. `/admin/shops` returns
  full rows including **inactive** shops, which the picker would have had to filter itself.
  The fetch is deliberately **not** routed through TanStack Query: every key in `queryKeys`
  carries a shop id, and this list is account-level data identical under every shop, so it is
  cached in a module-level promise in `useActiveShop.js` instead (reset by logout via
  `forgetShopList`). That keeps requirement 4.1 and the SP1 check literally true.

- **`offline_catalog` is still not namespaced per shop.** Switching shops leaves the offline
  page showing the previous shop's saved catalog until its next refresh. Ticket 11 owns that
  key's migration — it has to move `offline_sales` at the same time (risk R3), and one
  migration over both keys is safer than two. What ticket 08 added is a guard: `refresh()`
  refuses to run without an active shop, so a refresh can never write one shop's catalog under
  another's session.
