# Design: DB-Driven Receipts & Shop Profile

## Overview

A small backend addition (one shop-scoped router), a change of signature on the receipt
renderer, a settings page, and the removal of a duplicate.

The interesting constraint is offline: the receipt must print with a correct header when the
device has no connection, which means the profile has to reach the printer through the same
cache the offline catalog already uses.

---

## Architecture

```
backend/
├── controllers/shopProfileController.js   ← NEW
├── routes/shopProfile.js                  ← NEW
└── server.js                              ← + one mount

webapp/tuldokbenta_web/src/
├── utils/printInvoice.js         ← signature change; all literals removed
├── hooks/
│   ├── useShopProfile.js         ← NEW
│   └── useOfflineCatalog.js      ← + profile in the snapshot
├── pages/ShopSettings.jsx        ← NEW
├── components/shared/
│   ├── Invoice.jsx               ← DELETED
│   ├── ReceiptPreview.jsx        ← NEW (the settings page's live preview)
│   └── navItems.js               ← + Shop Settings under "Manage"
└── queryClient.js                ← + shopProfile key, + PERSISTED_RESOURCES entry
```

### Why the profile endpoint is not under `/api/admin`

Ticket 06 put shop management under `/api/admin` behind `requireRole("super_admin")`, and its
design states plainly that no manager-reachable route may ever be added there — the whole
justification for that router accepting a shop id as an ordinary parameter is that its callers
already reach every shop.

A manager editing their own shop's receipt is exactly the case that would break it. So it goes
on its own shop-scoped route with `resolveShop`, where the shop comes from the validated
header and a manager cannot name a shop they are not assigned to.

```js
// server.js
app.use("/api/shop-profile", requireAuth, resolveShop, shopProfileRouter);
```

```js
// routes/shopProfile.js
router.get("/",  getShopProfile);                                         // all roles: the till prints
router.put("/",  requireRole("manager", "super_admin"), updateShopProfile);
```

`GET` is open to workers because the till needs the header to print a receipt. That is the
same reasoning that keeps `GET /api/inventory` worker-accessible.

`updateShopProfile` explicitly allowlists the columns it writes, so `slug` and `is_active`
cannot be reached through it even if a client sends them.

---

## Components and Interfaces

### `printInvoice(sale, shop)`

The current implementation writes a single template string into a popup via `document.write`.
That stays; only the identity block becomes data.

```js
// before — printInvoice.js:120-132
<img src="https://i.ibb.co/NFtDrgj/SPINCREDIBLE.png" … />
<h2 style="font-size:14px;margin:0;">SPINCREDIBLE</h2>
<p style="margin:0;">Rizal Street Ext</p>
<p style="margin:0;">Mo: 0962-683-7430</p>

// after
${shop?.logo_url ? `<div …><img src="${escapeHtml(shop.logo_url)}" … /></div>` : ""}
<div style="text-align:center;margin-bottom:8px;">
  ${shop?.name          ? `<h2 style="font-size:14px;margin:0;">${escapeHtml(shop.name)}</h2>` : ""}
  ${shop?.address_line  ? `<p style="margin:0;">${escapeHtml(shop.address_line)}</p>`          : ""}
  ${shop?.contact_number? `<p style="margin:0;">${escapeHtml(shop.contact_number)}</p>`        : ""}
</div>
```

Three things to preserve:

- **The existing `escapeHtml` helper covers the new fields too.** It exists at
  `printInvoice.js:12-18` because customer names and hand-edited invoice numbers are free
  text; shop details are now free text as well, and a shop name containing `<` must not break
  the document.
- **Empty fields omit their element** rather than rendering an empty `<p>`, which on a 58 mm
  roll is a visible blank line.
- **Paper width comes from the profile**: `width: ${shop?.receipt_paper_width_mm ?? 58}mm`.

The `shop` parameter is optional and every access is guarded. Requirement 3.3 says a receipt
with no available profile prints without a header rather than failing — for a cashier holding
a customer's money, a receipt with a missing header beats no receipt at all.

The line items, freebie de-duplication via `displayLines()`, totals, and the popup-blocked
early return are untouched.

### `useShopProfile.js`

An ordinary scoped query:

```js
queryKey: queryKeys.shopProfile(shopId),
queryFn: () => apiRequest("/shop-profile"),
enabled: Boolean(shopId),
staleTime: staleTimes.services,   // edited about as often as services
```

`shopProfile` joins `PERSISTED_RESOURCES` in `queryClient.js`. This is the same reasoning
already recorded there for `paymentMethods` — "without this the pay dialog would have an empty
method dropdown until the first fetch lands, which is the one moment a cashier cannot wait".
A blank receipt header is the same class of problem.

### Offline

Persisting the query covers a reload with a warm cache. The offline page needs more, because
it resolves its data through `useOfflineCatalog` rather than through the normal query path.

So the profile is added to the offline catalog snapshot:

```js
// OFFLINE_CATALOG_KEY now holds
{ inventory, services, shop, syncedAt }
```

The existing "⟳ Refresh catalog" button fetches it alongside inventory and services, and the
existing behaviour — a failed refresh keeps the current snapshot rather than emptying it —
applies to the profile too.

The snapshot is per shop once ticket 11 namespaces the storage keys. Until then it holds the
active shop's profile and is replaced on switch, which is correct but not yet durable across
switches; ticket 11 closes that.

### `pages/ShopSettings.jsx` and `ReceiptPreview.jsx`

A form over the profile fields plus a live preview. The preview reuses the header markup
rather than re-implementing it — extract the header-building into a small exported function in
`printInvoice.js` that both the printed document and the React preview consume, so the preview
cannot drift from what actually prints.

The `invoice_prefix` warning (Requirement 4.4) fires when the shop has sales. The backend's
`PUT` response already carries that signal from ticket 06's equivalent on the admin route;
mirror it here.

### Deleting `Invoice.jsx`

`Invoice.jsx` is a `forwardRef` component built for `react-to-print`, which is in
`package.json` and imported nowhere. The component duplicates every literal this ticket is
removing, so leaving it means the two drift the moment someone edits one.

Deletion carries a pre-flight check, matching the discipline the `component-folder-restructure`
spec applied to its own dead-code removal: re-grep for importers immediately before removing,
and stop if any have appeared.

---

## Data Models

No schema changes — ticket 02 added every column.

The Receipt Profile as served:

```js
{ id, name, address_line, contact_number, logo_url,
  receipt_footer, receipt_paper_width_mm, invoice_prefix }
```

`slug` and `is_active` are deliberately absent from the `PUT` allowlist, though `slug` may be
returned for display.

---

## Error Handling

| Condition | Behaviour |
|---|---|
| Profile fetch fails, cache warm | Cached profile used; receipt prints normally |
| Profile fetch fails, cache cold | Receipt prints with the header omitted |
| Worker attempts `PUT /api/shop-profile` | 403 |
| `PUT` includes `slug` or `is_active` | Ignored by the allowlist, 200 |
| `receipt_paper_width_mm` non-numeric | 400 |
| Logo URL unreachable at print time | The browser renders a broken image; the rest of the receipt prints |
| Popup blocked | Existing warn-and-return path, unchanged |

The logo row is worth noting: the current logo is hotlinked from `i.ibb.co`, so a receipt
already depends on an external host being reachable at print time. This ticket does not fix
that — it makes it configurable, which is a precondition for fixing it later by storing a data
URI instead.

---

## Correctness Properties

The renderer is a pure string builder, which makes it a genuinely good property-test target —
and the existing `printInvoice.test.js` already tests it that way.

### P1 — No shop literal survives

For any Receipt Profile, the rendered HTML contains none of `SPINCREDIBLE`, `Rizal Street Ext`,
`0962-683-7430` or `i.ibb.co`, unless those strings were in the profile itself.

*Validates: 2.1*

### P2 — Every profile field is escaped

For any profile whose fields contain `<script>`, `"` or `&`, the rendered HTML contains no
unescaped occurrence of them.

*Validates: 2.6*

### P3 — Empty fields produce no element

For any profile with an empty or missing field, the output contains no empty `<p>` or `<h2>`,
and no `<img>` when the logo URL is empty.

*Validates: 2.4, 2.5*

### P4 — A missing profile still prints

For any sale and a `shop` of `undefined` or `null`, the renderer produces a document
containing the sale's line items and total.

*Validates: 3.3*

### Structural property SP1 — the literals are gone

```powershell
rg -n "SPINCREDIBLE|Rizal Street|0962-683-7430|i\.ibb\.co|58mm" webapp/tuldokbenta_web/src
```
returns nothing.

*Validates: 2.1, 5.1*

### Structural property SP2 — one renderer

```powershell
rg -n "react-to-print|shared/Invoice" webapp/tuldokbenta_web
```
returns nothing outside `package-lock.json`.

*Validates: 5.1, 5.2, 5.3*

---

## Testing Strategy

### Existing tests

`src/__tests__/printInvoice.test.js` is 378 lines and stubs `window.open` to assert on the
captured HTML. Crucially, **no existing test asserts on the shop name, address, phone or
footer** — the pinned strings are `Date: `, `Customer: `, `Paid:`, `Total`, the escaping
behaviour and the freebie de-duplication. So the suite needs only the new parameter threaded
through; no assertion changes.

That is a fortunate accident worth stating: it means a passing suite after this change is real
evidence that the line-item and totals behaviour did not move.

### New tests

Add P1–P4 to the same file using `fast-check`.

### Manual verification

| Step | Confirms |
|---|---|
| Print a receipt at Shop 1 | Byte-for-byte the same header as before this ticket |
| Edit Shop 1's phone number, print again | New number appears |
| Print at Shop 2 | Shop 2's own details |
| Clear the address line, print | No blank line on the receipt |
| Clear the logo URL, print | No image block, no broken-image icon |
| Set paper width to 80, print | The print preview widens |
| Go offline, reload, print from the offline page | Header still present |
| Clear `localStorage`, go offline, print | Prints without a header rather than failing |
| Worker opens the settings route | Redirected away |
| Manager edits `invoice_prefix` on a shop with sales | Warning shown before saving |

The two offline rows are the ones this ticket most easily gets wrong, and neither shows up in
normal online testing.
