# Implementation Plan: DB-Driven Receipts & Shop Profile

## Overview

Move the receipt's identity out of a template string and into the shop row. Adds one
shop-scoped backend route, turns the logo into an uploaded blob, changes the renderer's
signature, adds a settings page and a receipt preview, and deletes a duplicate renderer nothing
imports.

## Tasks

- [x] 1. Create the shop-profile endpoint
  - `backend/controllers/shopProfileController.js` with `getShopProfile` and
    `updateShopProfile`, both scoping on `req.shopId` only
  - `updateShopProfile` writes an explicit **allowlist** of columns, so `slug` and `is_active`
    cannot be reached through it even if a client sends them
  - Write the audit event using the transactional path from ticket 05
  - Validation extracted to `backend/utils/shopProfile.js` and shared with ticket 06's admin
    route, so a manager's edit and a super admin's cannot accept different things
  - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7_

- [x] 2. Create `backend/routes/shopProfile.js` and mount it
  - `GET /` unguarded by role — the till needs the header to print, the same reasoning that
    keeps `GET /api/inventory` worker-accessible
  - `PUT /` behind `requireRole("manager","super_admin")`
  - Mount as `app.use("/api/shop-profile", requireAuth, resolveShop, shopProfileRouter)`
  - Do **not** put this under `/api/admin` — ticket 06's design states no manager-reachable
    route may go there, because that router's acceptance of a shop id as a plain parameter is
    justified only by every caller already reaching every shop
  - _Requirements: 1.3, 1.4, 1.5_

- [x] 3. The logo becomes an uploaded blob
  - `initDB.js`: `logo_blob BYTEA`, `logo_mime`, `logo_updated_at`, added idempotently.
    **Keep `logo_url`** — it is Shop 1's seeded logo and the renderer's fallback, which is what
    makes the rollout invisible
  - `backend/utils/shopLogo.js`: the mime allowlist (no SVG), the 512 KB cap, the
    `encode(logo_blob,'base64')` select fragments, and `rawImage` — `express.raw` wrapped so a
    413 answers in JSON. There is no error-handling middleware in this backend, so unwrapped it
    would return HTML that `api.js` cannot read
  - `POST`/`DELETE /api/shop-profile/logo`, plus the same three under
    `/api/admin/shops/:id/logo` for the console, sharing one implementation
  - The audit event records `{ has_logo, logo_mime }` and **never** the bytes
  - _Requirements: 1a.1–1a.10_

- [x] 4. Keep the bytes out of the shop listing
  - `listShops`, `updateShop` and `setShopActive` named columns explicitly instead of
    `SELECT *` / `RETURNING *`, yielding `has_logo` rather than the image
  - Without this a console showing ten shops drags ten images through the driver to draw ten
    cards — the single easiest thing in this ticket to miss
  - _Requirements: 1a.11_

- [x] 5. Rewrite `src/utils/printInvoice.js` to take a profile
  - Split into `buildReceiptDocument(sale, shop, { printButton })` — pure — and
    `printInvoice(sale, shop)`, which opens the popup and writes it. Task 9's preview consumes
    the builder, so it cannot drift from what prints
  - Replaced the hardcoded logo, name, address and contact blocks with conditional
    interpolation; `width: 58mm` with the profile's `receipt_paper_width_mm` defaulting to 58;
    the footer text
  - Logo resolves `logo_data_url || logo_url || ""`, so an uploaded image wins and a legacy
    link still prints
  - Every profile field routed through the existing `escapeHtml` helper
  - An empty field emits no element; an empty `<p>` is a visible blank line on a 58 mm roll
  - Line items, `displayLines()` freebie de-duplication, totals and the popup-blocked early
    return untouched
  - _Requirements: 2.1–2.7, 3.3, 6.3_

- [x] 6. Update the call sites
  - `ListSales.jsx` and `ListClosedSales.jsx` read `useShopProfile()` directly, as
    `ListClosedSales` already reads `usePaymentMethods()`
  - `OpenSalesOffline.jsx` (both calls) takes the profile from the offline snapshot — the page
    deliberately runs no list queries
  - _Requirements: 2.1, 3.4_

- [x] 7. Add the `shopProfile` query
  - `queryKeys.shopProfile(shopId)` and a `staleTimes` entry matching `paymentMethods`
  - `src/hooks/useShopProfile.js` with `enabled: Boolean(shopId)`
  - **Added `shopProfile` to `PERSISTED_RESOURCES`** — the same reasoning already written there
    for `paymentMethods`: a blank receipt header on first paint lands at the one moment a
    cashier cannot wait
  - Filed in `__tests__/queryKeys.test.js` as shop-scoped, which its coverage test requires
  - _Requirements: 3.1_

- [x] 8. Put the profile in the offline catalog snapshot
  - `useOfflineCatalog.js` fetches and stores `shop` alongside `inventory` and `services` under
    `OFFLINE_CATALOG_KEY`, so ticket 11 has one key to migrate rather than two
  - The existing "⟳ Refresh catalog" button covers it
  - A failed refresh still keeps the current snapshot rather than emptying it
  - _Requirements: 3.1, 3.2, 3.4_

- [x] 9. `ReceiptPreview.jsx` and the sample sale
  - The real print document in a `sandbox=""` iframe, not a React re-creation — so Requirement
    5 holds and the preview cannot disagree with the printer
  - `data/sampleReceipt.js`: a fixed sale in the flat STORED shape, with no `Date.now()` so the
    preview does not flicker on every keystroke
  - _Requirements: 4.3, 4a.3, 4a.4_

- [x] 10. The logo control
  - `components/shared/LogoField.jsx` — the first `<input type="file">` in this app — plus
    `utils/logoFile.js` mirroring the server's mime and size rules so a 4 MB photo is refused
    without a round trip
  - Replaced the Logo URL text input in `ShopProfileFields.jsx`. A file input carries its value
    on `e.target.files`, so it takes its own callback rather than the `set` helper
  - _Requirements: 1a.8, 4.6_

- [x] 11. `apiRequest` learns a raw body
  - One `rawBody` option: a `File` goes out unwrapped with its own type as the Content-Type
  - Through `apiRequest` rather than around it, so an upload inherits the auth header, the shop
    header, the single-flight 401 refresh and the 403 shop recovery
  - `rawBody` is passed through the 401 retry — a Blob is re-readable, a stream would not be
  - _Requirements: 1a.1_

- [x] 12. Property tests in `src/__tests__/printInvoice.test.js`
  - P1 (no shop literal survives), P2 (every profile field escaped), P3 (empty fields produce
    no element, and the upload/URL/none logo cases), P4 (a missing profile still prints the
    sale), P5 (`buildReceiptDocument` is what `printInvoice` writes)
  - The existing assertions pin `Date: `, `Customer: `, `Paid:`, `Total`, escaping and freebie
    de-duplication — **none of them assert on the shop's name, address or phone** — so they
    needed only the new parameter threaded through, with no assertion changes. The suite
    passing afterwards is therefore real evidence the line-item behaviour did not move
  - _Requirements: 2.1, 2.4, 2.5, 2.6, 3.3, 6.2_

- [x] 13. `pages/ShopSettings.jsx`
  - Form over every Receipt Profile field beside a live preview, restricted to `manager` and
    `super_admin` — the route guard derives from `rolesForPath`
  - Saves the profile first and the logo second, so a rejected image cannot also lose the
    address just typed
  - Surfaces the `invoice_prefix` warning after saving
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_

- [x] 14. The preview in the super-admin console
  - Live pane in `AddShopModal` and `EditShopModal`, driven by `profilePreview(form, name)` so
    it updates as the admin types
  - `ReceiptPreviewModal` from a "Receipt" action on each shop card, fetching that one shop's
    logo since the list carries only `has_logo`
  - `AddShopModal` holds the picked file until the create returns an id to upload against
  - _Requirements: 4a.1, 4a.2, 4a.5_

- [x] 15. Add the settings link to navigation
  - "Receipt Settings" under the existing "Manage" group in `navItems.js`, with manager+ roles
  - `App.jsx` picks up the guard automatically via `rolesForPath` from ticket 07
  - _Requirements: 4.5_

- [x] 16. Delete the duplicate renderer
  - Re-grepped for importers of `shared/Invoice` immediately before removing it — none
  - `git rm src/components/shared/Invoice.jsx`
  - Removed `react-to-print` from `package.json` after confirming it had no importers
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 17. Run the structural checks
  - SP1: `rg "SPINCREDIBLE|Rizal Street|0962-683-7430|i\.ibb\.co|58mm" src` — hits only in the
    tests that assert those literals are gone
  - SP2: `rg "react-to-print|shared/Invoice" webapp/tuldokbenta_web` — nothing
  - SP3: `rg "SELECT \*|RETURNING \*" backend/controllers/adminShopsController.js` — nothing
  - _Requirements: 2.1, 5.1, 5.2, 5.3, 1a.11_

- [ ] 18. Verification checkpoint
  - [x] `node --test` in `backend/` — 163 pass
  - [x] `npm test` — 469 pass; `npm run build` succeeds; `npm run lint` clean apart from two
        pre-existing errors in `useCart.test.js` (untouched by this ticket, from commit
        `215dd6f`)
  - [x] Backend booted twice against the Neon rehearsal branch: `initDB` is idempotent with the
        three new columns
  - [x] Endpoints driven end to end: `GET`/`PUT`, upload, wrong content type → 400, 2 MB → 413
        as JSON, `DELETE`, and a smuggled `slug`/`is_active` ignored
  - [x] Audit rows confirmed at 105 bytes with no base64
  - [x] Shop 1's rendered header confirmed byte-identical to the old hardcoded block, and a
        receipt with no profile confirmed to print with no empty elements
  - [ ] Walk the manual table in the design in a browser
  - [ ] **Do not skip the two offline rows**: printing offline with a warm cache must show the
        header, and printing offline with `localStorage` cleared must still produce a receipt
        without one. Neither appears in online testing

## Notes

- The logo is no longer hotlinked. A shop that has uploaded one carries it inline as base64, so
  printing depends on no external host and works with no connection. `logo_url` survives as the
  fallback for a shop configured before this ticket — Shop 1 included, which is what keeps
  Requirement 6.1 true without anyone re-uploading anything during the rollout.
- Ticket 11 namespaces the offline storage keys per shop. The profile rides inside
  `OFFLINE_CATALOG_KEY` rather than a key of its own precisely so that migration stays one key.
- The 512 KB upload cap is set by localStorage, not by Postgres: a till holds the profile twice
  and base64 inflates it by a third.
