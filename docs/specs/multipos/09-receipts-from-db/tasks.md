# Implementation Plan: DB-Driven Receipts & Shop Profile

## Overview

Move the receipt's identity out of a template string and into the shop row. Adds one
shop-scoped backend route, changes the renderer's signature, adds a settings page, and deletes
a duplicate renderer nothing imports.

## Tasks

- [ ] 1. Create the shop-profile endpoint
  - `backend/controllers/shopProfileController.js` with `getShopProfile` and
    `updateShopProfile`, both scoping on `req.shopId` only
  - `updateShopProfile` writes an explicit **allowlist** of columns, so `slug` and `is_active`
    cannot be reached through it even if a client sends them
  - Write the audit event using the transactional path from ticket 05
  - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7_

- [ ] 2. Create `backend/routes/shopProfile.js` and mount it
  - `GET /` unguarded by role — the till needs the header to print, the same reasoning that
    keeps `GET /api/inventory` worker-accessible
  - `PUT /` behind `requireRole("manager","super_admin")`
  - Mount as `app.use("/api/shop-profile", requireAuth, resolveShop, shopProfileRouter)`
  - Do **not** put this under `/api/admin` — ticket 06's design states no manager-reachable
    route may go there, because that router's acceptance of a shop id as a plain parameter is
    justified only by every caller already reaching every shop
  - _Requirements: 1.3, 1.4, 1.5_

- [ ] 3. Rewrite `src/utils/printInvoice.js` to take a profile
  - Signature becomes `printInvoice(sale, shop)`; `shop` is optional and every access guarded
  - Replace the hardcoded logo, name, address and contact blocks with conditional
    interpolation; replace `width: 58mm` with the profile's `receipt_paper_width_mm` defaulting
    to 58; replace the footer text
  - Route every profile field through the existing `escapeHtml` helper — shop details are now
    free text, and a name containing `<` must not break the document
  - Omit the element entirely for an empty field; an empty `<p>` is a visible blank line on a
    58 mm roll
  - Extract the header-building into a small exported function so task 8's preview consumes the
    same code and cannot drift from what prints
  - Leave the line items, `displayLines()` freebie de-duplication, totals and the
    popup-blocked early return untouched
  - _Requirements: 2.1–2.7, 3.3, 6.3_

- [ ] 4. Update the three call sites
  - `components/open-sales/ListSales.jsx`, `components/closed-sales/ListClosedSales.jsx`, and
    `pages/OpenSalesOffline.jsx` (which calls it twice — once to print, once to reprint after
    an invoice-number reassignment)
  - Each passes the profile from `useShopProfile` or, on the offline page, from the cached
    snapshot
  - _Requirements: 2.1, 3.4_

- [ ] 5. Add the `shopProfile` query
  - `queryKeys.shopProfile(shopId)` and a `staleTimes` entry matching `services`
  - Create `src/hooks/useShopProfile.js` with `enabled: Boolean(shopId)`
  - **Add `shopProfile` to `PERSISTED_RESOURCES`** — the same reasoning already written there
    for `paymentMethods`: a blank receipt header on first paint lands at the one moment a
    cashier cannot wait
  - _Requirements: 3.1_

- [ ] 6. Put the profile in the offline catalog snapshot
  - `useOfflineCatalog.js` fetches and stores `shop` alongside `inventory` and `services` under
    `OFFLINE_CATALOG_KEY`
  - The existing "⟳ Refresh catalog" button covers it
  - Preserve the existing behaviour that a failed refresh keeps the current snapshot rather
    than emptying it
  - _Requirements: 3.1, 3.2, 3.4_

- [ ] 7. Add property tests to `src/__tests__/printInvoice.test.js`
  - P1 (no shop literal survives), P2 (every profile field escaped), P3 (empty fields produce
    no element), P4 (a missing profile still prints the sale)
  - The existing 378 lines of assertions pin `Date: `, `Customer: `, `Paid:`, `Total`, escaping
    and freebie de-duplication — **none of them assert on the shop's name, address or phone**,
    so they need only the new parameter threaded through, with no assertion changes. A passing
    suite afterwards is therefore real evidence the line-item behaviour did not move
  - _Requirements: 2.1, 2.4, 2.5, 2.6, 3.3, 6.2_

- [ ] 8. Create `pages/ShopSettings.jsx` and `components/shared/ReceiptPreview.jsx`
  - Form over every Receipt Profile field, restricted to `manager` and `super_admin` via
    `RequireRole`
  - Live preview consuming the header function extracted in task 3
  - Warn when `invoice_prefix` changes on a shop that already has sales, mirroring the signal
    ticket 06 returns on its admin equivalent
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 9. Add the settings link to navigation
  - New entry under the existing "Manage" group in `navItems.js`, with manager+ roles
  - `App.jsx` picks up the guard automatically via `rolesForPath` from ticket 07
  - _Requirements: 4.5_

- [ ] 10. Delete the duplicate renderer
  - Re-grep for importers of `shared/Invoice` **immediately before** removing it, and stop if
    any have appeared — the same pre-flight discipline the `component-folder-restructure` spec
    applied to its own dead-code removal
  - `git rm src/components/shared/Invoice.jsx`
  - Remove `react-to-print` from `package.json` after confirming it has no importers
  - _Requirements: 5.1, 5.2, 5.3_

- [ ] 11. Run the structural checks
  - `rg -n "SPINCREDIBLE|Rizal Street|0962-683-7430|i\.ibb\.co|58mm" src` returns nothing (SP1)
  - `rg -n "react-to-print|shared/Invoice" webapp/tuldokbenta_web` returns nothing outside
    `package-lock.json` (SP2)
  - _Requirements: 2.1, 5.1, 5.2, 5.3_

- [ ] 12. Verification checkpoint
  - `npm run build`, `npm test` and `npm run lint` pass
  - Print a Shop 1 receipt and compare it against one printed before this ticket — they must be
    visually identical, since the profile was seeded from exactly these literals
  - Walk the manual table from the design
  - **Do not skip the two offline rows**: printing offline with a warm cache must show the
    header, and printing offline with `localStorage` cleared must still produce a receipt
    without one. Neither appears in online testing
  - Ask the user if any questions arise before closing out

## Notes

- The logo is still hotlinked from an external host, so a receipt already depends on that host
  being reachable at print time. This ticket does not change that — it makes the URL
  configurable, which is the precondition for later storing a data URI instead.
- Ticket 11 namespaces the offline storage keys per shop. Until then the snapshot holds the
  active shop's profile and is replaced on switch — correct, but not durable across switches.
