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
├── config/initDB.js                       ← + logo_blob / logo_mime / logo_updated_at
├── controllers/shopProfileController.js   ← NEW
├── controllers/adminShopsController.js    ← explicit column lists; validation extracted
├── routes/shopProfile.js                  ← NEW
├── routes/admin.js                        ← + three logo routes
├── utils/shopLogo.js                      ← NEW (mime allowlist, raw parser, data URI)
├── utils/shopProfile.js                   ← NEW (validation shared by both edit paths)
└── server.js                              ← + one mount

webapp/tuldokbenta_web/src/
├── utils/
│   ├── printInvoice.js           ← split into buildReceiptDocument + printInvoice
│   ├── logoFile.js               ← NEW (client-side mirror of the mime/size rules)
│   └── shopProfile.js            ← + logo_data_url, + profilePreview
├── hooks/
│   ├── useShopProfile.js         ← NEW
│   ├── useAdminShops.js          ← + logo mutation, + fetchShopLogo
│   └── useOfflineCatalog.js      ← + profile in the snapshot
├── data/sampleReceipt.js         ← NEW (the sale the preview renders)
├── pages/
│   ├── ShopSettings.jsx          ← NEW
│   └── AdminShops.jsx            ← + preview modal, + logo save
├── components/
│   ├── shared/Invoice.jsx        ← DELETED
│   ├── shared/ReceiptPreview.jsx ← NEW (the real print document in an iframe)
│   ├── shared/LogoField.jsx      ← NEW
│   ├── shared/navItems.js        ← + Receipt Settings under "Manage"
│   ├── admin/ReceiptPreviewModal.jsx ← NEW
│   ├── admin/ShopProfileFields.jsx   ← Logo URL input → upload control
│   └── admin/{Add,Edit}ShopModal.jsx ← + live preview pane
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
router.get("/",     getShopProfile);                                            // all roles: the till prints
router.put("/",     requireRole("manager", "super_admin"), updateShopProfile);
router.post("/logo",   managerUp, rawImage, uploadShopLogo);
router.delete("/logo", managerUp, deleteShopLogo);
```

`GET` is open to workers because the till needs the header to print a receipt. That is the
same reasoning that keeps `GET /api/inventory` worker-accessible.

`updateShopProfile` explicitly allowlists the columns it writes, so `slug` and `is_active`
cannot be reached through it even if a client sends them.

---

## The logo

### Why bytes and not a URL

The original plan for this ticket kept `logo_url` and named "storing a data URI instead" as a
later fix. It is done here because a URL cannot satisfy the constraints this ticket already
has:

- A receipt is printed into a popup built by `document.write`. Its `<img>` sends no
  `Authorization` and no `X-Shop-Id`, so a guarded endpoint cannot serve it.
- Requirement 3 says a receipt must print with a header when the device is offline. There is
  nothing to fetch a URL over.

Both are answered by the same thing: store the bytes, and serve them inline as base64 on the
profile `GET`. The image then travels with the profile into the persisted query cache and the
offline snapshot, and reaches the printer as an ordinary `src="data:image/png;base64,…"`.

### Schema

Three idempotent adds to `shops`: `logo_blob BYTEA`, `logo_mime VARCHAR(50)`,
`logo_updated_at TIMESTAMP`. `logo_url` is **kept** and becomes a read-only fallback — Shop 1
was seeded with the hotlinked image, and Requirement 6.1 says its receipt must be unchanged.
Nothing needs re-uploading for the rollout to be invisible.

The renderer prefers the upload: `shop.logo_data_url || shop.logo_url || ""`.

### Transport

`express.raw({ type: ALLOWED_LOGO_MIME, limit: 512kb })`, mounted **per route**, not globally —
`express.json()` keeps its own default limit because no image goes through the JSON path. No
new dependency: multer would buy nothing for a single-file, single-field upload.

It is wrapped rather than used bare. This backend has **no error-handling middleware at all**,
so an oversized body would reach Express's default handler and come back as HTML, which
`api.js` then parses as JSON and reports as a generic failure. The wrapper answers 413 and 400
in the `{ message }` shape every other endpoint uses.

On the client, `apiRequest` grows one option, `rawBody`. A `File` goes out unwrapped with its
own type as the `Content-Type`. It routes through `apiRequest` rather than around it so the
upload inherits the auth header, the shop header, the single-flight 401 refresh and the 403
shop recovery. A `Blob` is re-readable, which is what makes replaying it on the 401 retry safe —
a stream would not be, and must not be passed.

### No SVG

`image/png`, `image/jpeg`, `image/webp`. An SVG data URI in the print popup would execute its
own script in a document assembled by string concatenation, so it is refused on both sides.

### Keeping bytes out of the wrong places

Two leaks are easy to write and invisible once written:

- **`SELECT *` on `shops`.** `listShops`, `updateShop` and `setShopActive` all used `*` or
  `RETURNING *`. With a blob column, a console listing ten shops drags ten images through the
  driver to render ten cards. All of them now name columns explicitly through a shared
  `shopColumns` fragment that yields `(logo_blob IS NOT NULL) AS has_logo` instead — and the
  console fetches one shop's image at a time from `/admin/shops/:id/logo`.
- **The audit trail.** `audit_log.changes` is JSONB the console renders as a change summary.
  A logo write records `{ has_logo, logo_mime }` and never the bytes.

The base64 is computed by Postgres — `encode(logo_blob, 'base64')` — which sidesteps any
question of how the neon-http driver decodes `BYTEA` on the way back.

### Size

512 KB, set by localStorage rather than by the database. A till holds the profile twice — in
the persisted query cache and in the offline catalog snapshot — so 512 KB of image is ~1.4 MB
of base64 against a ~5 MB quota. A logo printed 50 mm wide has no use for more.

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

### `ReceiptPreview.jsx`

`printInvoice.js` splits in two: `buildReceiptDocument(sale, shop, { printButton })`, a pure
string builder, and `printInvoice(sale, shop)`, which opens the popup and writes what the
builder returned.

`ReceiptPreview` then renders that document in an `<iframe srcDoc>`. Not a React re-creation of
the receipt, and not `dangerouslySetInnerHTML` — for two reasons that are the whole point of
the component:

- **It cannot drift.** Requirement 5 says exactly one module renders a receipt. The preview is
  showing that module's output, so a change to the printed layout appears here for free and a
  preview that disagrees with the printer is not expressible.
- **CSS isolation.** The receipt document sets its own body width in millimetres and its own
  monospace font. Dropped into the page it would inherit Tailwind's reset; inside a frame it is
  its own document, exactly as it is when it opens in its own window.

The frame is `sandbox=""` — nothing in a receipt needs to run, and the document interpolates
text somebody typed.

The sale it renders is a fixed fixture in `data/sampleReceipt.js`, in the flat STORED shape
real sales have. No `Date.now()` anywhere: the preview re-renders on every keystroke, and a
moving timestamp would make the whole receipt flicker while somebody is fixing a phone number.

### Where the preview appears

Three mounts, one component:

| Where | Why |
|---|---|
| `pages/ShopSettings.jsx` | A manager's own shop (Requirement 4.3) |
| `{Add,Edit}ShopModal` | Live beside the fields, updating as the super admin types |
| `ReceiptPreviewModal` from the shop card | Any shop, without entering the editor |

The modals read the half-edited form through `profilePreview(form, name)`, which shapes form
state into what the renderer reads — so the preview is driven by the same object the printer
will eventually get.

### `pages/ShopSettings.jsx`

A form over the profile fields beside that preview. The `invoice_prefix` warning (Requirement
4.4) fires when the shop has sales; the backend's `PUT` response carries the signal, shared
with ticket 06's admin route through `utils/shopProfile.js` so the two cannot word it
differently.

The logo is saved as a second request, after the profile `PUT`. Ordering them that way means a
rejected image cannot also lose the address that was just typed.

### Deleting `Invoice.jsx`

`Invoice.jsx` is a `forwardRef` component built for `react-to-print`, which is in
`package.json` and imported nowhere. The component duplicates every literal this ticket is
removing, so leaving it means the two drift the moment someone edits one.

Deletion carries a pre-flight check, matching the discipline the `component-folder-restructure`
spec applied to its own dead-code removal: re-grep for importers immediately before removing,
and stop if any have appeared.

---

## Data Models

Ticket 02 added every text column. This ticket adds three for the uploaded logo, idempotently,
and drops nothing.

The Receipt Profile as served:

```js
{ id, name, slug, address_line, contact_number,
  logo_url,           // legacy fallback, read-only
  logo_data_url,      // "data:image/png;base64,…" or null
  logo_mime, logo_updated_at, has_logo,
  receipt_footer, receipt_paper_width_mm, invoice_prefix,
  is_active, created_at }
```

`slug` and `is_active` are deliberately absent from the `PUT` allowlist, though both are
returned for display. `logo_url` is absent from it too: no form edits it any more, so a diff
that listed it would record a change the statement never made.

---

## Error Handling

| Condition | Behaviour |
|---|---|
| Profile fetch fails, cache warm | Cached profile used; receipt prints normally |
| Profile fetch fails, cache cold | Receipt prints with the header omitted |
| Worker attempts `PUT /api/shop-profile` | 403 |
| Worker attempts `POST /api/shop-profile/logo` | 403, before any body is read |
| `PUT` includes `slug` or `is_active` | Ignored by the allowlist, 200 |
| `receipt_paper_width_mm` non-numeric | 400 |
| Upload of the wrong content type | 400 `{ message }` |
| Upload over 512 KB | 413 `{ message }` — refused in the browser first |
| Logo upload fails after the profile saved | The profile change stands; the modal shows the error and stays open |
| Legacy `logo_url` unreachable at print time | The browser renders a broken image; the rest of the receipt prints |
| Popup blocked | Existing warn-and-return path, unchanged |

The last row is now the *legacy* case only. A shop that has uploaded a logo carries it inline,
so printing no longer depends on any external host — which was the point of doing the blob work
in this ticket rather than deferring it.

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

### Structural property SP3 — no blob leaves through a wildcard

```powershell
rg -n "SELECT \*|RETURNING \*" backend/controllers/adminShopsController.js
```
returns nothing. Every query against `shops` names its columns, so adding a column can never
silently start shipping it to the console.

*Validates: 1a.11*

### P5 — the preview is the print document

`buildReceiptDocument(sale, shop)` equals what `printInvoice(sale, shop)` writes, for the same
input. This is what makes the preview trustworthy rather than merely similar.

*Validates: 4a.3, 5.3*

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
| Upload a PNG, print | The uploaded logo replaces the hotlinked one |
| Remove the logo, print | No image block, no broken-image icon |
| Upload a 4 MB image | Refused in the browser, no request sent |
| Set paper width to 80, print | The print preview widens; the logo scales with it |
| Go offline, reload, print from the offline page | Header and logo still present |
| Clear `localStorage`, go offline, print | Prints without a header rather than failing |
| Worker opens the settings route | Redirected away |
| Manager edits `invoice_prefix` on a shop with sales | Warning shown after saving |
| Super admin types in Edit Shop | The preview updates live |
| Super admin opens "Receipt" on a shop card | That shop's sample receipt |
| Console shop list network payload | No base64 in it |
| Audit log after a logo upload | A `shop.update` row naming `has_logo`, with no base64 |

The two offline rows are the ones this ticket most easily gets wrong, and neither shows up in
normal online testing.
