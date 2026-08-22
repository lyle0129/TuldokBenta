# Design: Shop Picker & Shop-Scoped Cache

## Overview

Three changes that must land together: an active-shop store, the `X-Shop-Id` header, and a
shop dimension on every query key. Shipping the header without the keys would serve one shop's
data under another shop's cache entry — the worst of the three possible partial states, and a
silent one.

---

## Architecture

```
src/
├── utils/
│   ├── session.js        ← + active shop id, stored with the session
│   └── storage.js        ← + ACTIVE_SHOP_KEY
├── api.js                ← + X-Shop-Id
├── queryClient.js        ← every key becomes a function of shopId
├── hooks/
│   ├── useActiveShop.js  ← NEW
│   └── use*.js           ← every hook passes shopId into its key
├── components/shared/
│   ├── ShopPicker.jsx    ← NEW
│   ├── Navbar.jsx        ← renders it
│   └── NavDrawer.jsx     ← renders it
└── pages/SelectShop.jsx  ← NEW: the multi-shop landing and no-shop explainer
```

---

## Key design: the shape of a scoped key

The resource name **stays at index 0** and the shop id goes at index 1:

```js
export const queryKeys = {
  inventory:      (shopId) => ["inventory", shopId],
  services:       (shopId) => ["services", shopId],
  paymentMethods: (shopId) => ["paymentMethods", shopId],
  openSales:      (shopId) => ["openSales", shopId],
  nextInvoice:    (shopId) => ["nextInvoice", shopId],
  closedSales:    (shopId) => ["closedSales", shopId],
  closedSalesDay:    (shopId, isoDate) => ["closedSales", shopId, "day", isoDate],
  closedSalesWindow: (shopId, from, to) => ["closedSales", shopId, "window", from, to],
};
```

The alternative — prefixing with `["shop", shopId, "inventory"]` — reads more naturally but
breaks two things that currently work:

- `persistOptions.dehydrateOptions.shouldDehydrateQuery` filters on
  `PERSISTED_RESOURCES.includes(query.queryKey[0])`. Moving the resource name off index 0
  would silently stop persisting everything, and the symptom is a blank first paint rather
  than an error.
- Every closed-sales key deliberately shares the `["closedSales"]` prefix so that one
  invalidation covers every cached day and window — a property the existing comment in
  `queryClient.js` calls out explicitly. Keeping the resource first preserves it; the shop id
  simply narrows the prefix.

So the shape here is chosen to leave both mechanisms untouched.

## Clearing on switch

With the shop in the key, stale cross-shop data cannot be *served*. But the persisted cache
would still accumulate every shop the user visits, in a `localStorage` entry capped only by
its 24-hour `maxAge`. So a switch calls the existing `clearQueryCache()` before setting the
new shop.

That is a deliberate trade: switching costs a refetch. Managers switch a few times a day at
most, and the alternative is an unbounded cache holding several shops' sales history in
`localStorage` on a shared terminal.

Order matters — clear, then set, then let the new queries mount. Setting first lets in-flight
queries from the old shop resolve into the new shop's keys.

---

## Components and Interfaces

### `useActiveShop.js`

```js
export const useActiveShop = () => {
  const session = useAuth();
  const shopId  = useSyncExternalStore(subscribeSession, getActiveShopId, getActiveShopId);
  const shops   = useAvailableShops();      // session.shops, or the API for super admins
  return { shopId, shop: shops.find((s) => s.id === shopId) ?? null, shops, setShop };
};
```

`setShop(id)` clears the cache, writes the id, and notifies — reusing the session store's
existing listener set rather than adding a second one, so a single `useSyncExternalStore`
subscription covers both session and shop changes.

**Super admins fetch their shop list.** Requirement 2.2 exists because a super admin who
creates a shop in ticket 10's console must be able to switch into it without signing out. For
every other role the list comes from the session and needs no request.

### `api.js`

```js
const shopId = getActiveShopId();
if (shopId && !path.startsWith("/auth/") && !path.startsWith("/admin/")) {
  headers["X-Shop-Id"] = String(shopId);
}
```

`/admin/*` is excluded because those routes do not mount `resolveShop` — ticket 06 takes the
shop as an explicit parameter there. Sending the header would be harmless but misleading.

A 403 carrying the "not assigned to that shop" message clears the active shop and routes to
the picker (Requirement 3.4). That is the recovery path for a super admin whose assignment was
revoked mid-session, or for a stale persisted shop id.

### Gating: no shop, no queries

Requirement 3.3 — *no shop selected means no shop-scoped requests* — is enforced structurally
rather than by care. Every shop-scoped query passes `enabled: Boolean(shopId)`:

```js
useQuery({
  queryKey: queryKeys.inventory(shopId),
  queryFn: () => apiRequest("/inventory"),
  enabled: Boolean(shopId),
  staleTime: staleTimes.inventory,
});
```

Without it, a query fires with `shopId === undefined` in its key and no header, gets whatever
the backend's legacy fallback hands back, and caches it under a key nothing will ever
invalidate.

### `pages/SelectShop.jsx`

Serves both branches of Requirement 1: a chooser when the user has several shops and no valid
stored selection, and an explanatory screen when they have none. The second case is the one
worth building properly — a worker whose administrator has not assigned them yet otherwise
lands on a till with an empty catalog and no explanation.

### `ShopPicker.jsx`

A dropdown in the navbar's left cluster, where the `Spincredible` wordmark currently sits, and
a row at the top of the drawer under its header. Both places hardcode that wordmark today, so
both are replaced.

With exactly one available shop it renders the name as plain text, not a control
(Requirement 5.3) — a dropdown with one option invites a click that does nothing.

Switching while a cart has lines prompts for confirmation (Requirement 5.4). The cart lives in
component state in `OpenSales.jsx` via `useCart`, so the picker cannot inspect it directly; a
small module-level "cart is dirty" flag that `useCart` sets, read by the picker, is the least
invasive route.

---

## Data Models

Active shop id, stored beside the session:

| Key | Contents |
|---|---|
| `tb_active_shop` | The active shop's numeric id |

Stored separately from `tb_session` rather than inside it, so that a token refresh rewriting
the session cannot drop the shop selection.

---

## Error Handling

| Condition | Behaviour |
|---|---|
| No shop selected | Shop-scoped queries do not fire; `/select-shop` renders |
| Persisted shop no longer assigned | Discarded on load; picker rules re-apply |
| 403 "not assigned to that shop" | Active shop cleared; redirect to the picker |
| Super admin's shop list fails to load | Fall back to the session's shops with a warning |
| Switching with a dirty cart | Confirm first; cancel leaves the shop unchanged |
| User has no assigned shops | Explanatory screen naming their administrator |

---

## Correctness Properties

### P1 — Every key carries the shop

For every function on `queryKeys` and any shop id, the produced array contains that id.

*Validates: 4.1, 4.4*

### P2 — The resource name stays at index 0

For every function on `queryKeys`, element 0 is a resource name string, and for each of the
four persisted resources that name is in `PERSISTED_RESOURCES`.

*Validates: 4.2*

### P3 — Closed-sales keys share a prefix

For any shop and any arguments, `closedSales`, `closedSalesDay` and `closedSalesWindow` all
produce keys whose first two elements are `["closedSales", shopId]`.

*Validates: 4.2*

### P4 — Different shops never collide

For any two distinct shop ids, no key function produces equal arrays.

*Validates: 4.1*

### Structural property SP1 — no unscoped query key

```powershell
rg -n "queryKey:\s*\[" webapp/tuldokbenta_web/src
```
returns nothing — every key comes from a `queryKeys` function, never a literal array.

*Validates: 4.4*

---

## Testing Strategy

### Unit and property tests

A new `__tests__/queryKeys.test.js` covering P1–P4. These are pure functions over small
inputs, so `fast-check` is a good fit and the tests are quick.

### Component tests

- `ShopPicker` renders a control for two shops and plain text for one.
- `useActiveShop` discards a persisted shop that is not in the available list.

### Manual walk — needs two shops and two users

Set up: Shop A and Shop B with visibly different inventory; a manager assigned to both; a
worker assigned to A only.

| Step | Confirms |
|---|---|
| Worker signs in | No picker control; shop name shown; till loads A |
| Manager signs in, first time | Prompted to choose |
| Manager picks A, reloads | A is restored without prompting |
| Manager switches to B | Cache cleared; inventory visibly changes; no A rows appear |
| Manager switches to B with a cart in progress | Confirmation appears; cancelling keeps A and the cart |
| Manager reloads on B | B's data restored from cache, not A's |
| Manager checks `localStorage` | `tb_query_cache` holds one shop's data, not both |
| Super admin signs in | Every active shop listed, including one created after sign-in |
| Revoke the manager's B assignment, then act on B | 403 → returned to the picker |
| A user with no assignments signs in | Explanatory screen, not an empty till |
| Take a sale in A and one in B | Each gets its own invoice series |

The "reloads on B" and "`tb_query_cache` holds one shop" rows are the ones that catch a wrong
key shape. Both fail silently in normal use — the data simply looks stale — so they must be
checked deliberately.
