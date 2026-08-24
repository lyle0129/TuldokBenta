# Requirements: DB-Driven Receipts & Shop Profile

## Introduction

Receipt identity is hardcoded. `src/utils/printInvoice.js` builds its HTML from a template
string containing the literal shop name, address line, mobile number, logo URL, footer text
and 58 mm paper width. A second shop printing from this app would print the first shop's
details.

This ticket moves those values into the shop's Receipt Profile — already in the `shops` table
since ticket 02 — adds a manager-editable settings page, and makes the profile available
offline so a receipt printed without a connection still carries a header.

The logo becomes an **uploaded image rather than a link**. The original plan kept `logo_url`
and deferred this; it is done here instead, because a link cannot satisfy the two constraints
this ticket already has. A receipt is printed into a popup whose `<img>` can send no
`Authorization` or `X-Shop-Id` header, and Requirement 3 says a receipt must print with a
header when the device has no connection — an external URL fails both. Storing the bytes and
serving them inline as a data URI answers both at once.

It also resolves `src/components/shared/Invoice.jsx`, a React component that duplicates every
one of those literals and which nothing imports.

## Glossary

- **Receipt Profile** — the `shops` columns a printed receipt renders: name, address line,
  contact number, logo, footer text, paper width and invoice prefix.
- **Profile Endpoint** — the shop-scoped route serving and updating the Receipt Profile.
- **Logo Endpoints** — the routes that store, serve and remove a shop's logo bytes.
- **Receipt Renderer** — `src/utils/printInvoice.js`.
- **Receipt Preview** — the shop's receipt rendered on screen from the real print document.

---

## Requirements

### Requirement 1: A shop-scoped profile endpoint

**User Story:** As a manager, I want to edit my own shop's receipt details, so that I do not
need a super admin to fix a phone number.

#### Acceptance Criteria

1. THE API SHALL expose `GET /api/shop-profile`, returning the Receipt Profile of the shop
   resolved from the request.
2. THE API SHALL expose `PUT /api/shop-profile`, updating the Receipt Profile of that shop.
3. THE Profile Endpoint SHALL mount `requireAuth` and `resolveShop`, and SHALL derive the shop
   from `req.shopId` only — it SHALL NOT accept a shop identifier in the body or query.
4. THE `GET` SHALL be readable by all three roles, since the till needs it to print.
5. THE `PUT` SHALL be restricted to `manager` and `super_admin`.
6. THE `PUT` SHALL NOT permit changing `slug` or `is_active`; those remain super-admin-only
   through `/api/admin/shops`.
7. THE `PUT` SHALL write an Audit Event using the transactional path.

---

### Requirement 1a: The logo is uploaded, not linked

**User Story:** As a manager, I want to upload my shop's logo, so that receipts carry it
without depending on some image host still being reachable at print time.

#### Acceptance Criteria

1. THE API SHALL expose `POST /api/shop-profile/logo`, storing the request body as the
   resolved shop's logo.
2. THE API SHALL expose `DELETE /api/shop-profile/logo`, removing it.
3. THE Logo Endpoints SHALL accept `image/png`, `image/jpeg` and `image/webp` only. IF any
   other content type is sent, THEN THE API SHALL answer 400.
4. THE Logo Endpoints SHALL NOT accept SVG, because the logo is embedded into a document built
   by string concatenation where an SVG would execute its own script.
5. THE Logo Endpoints SHALL refuse a body over 512 KB with a 413 carrying a JSON `{ message }`,
   not the HTML the default Express error handler would produce.
6. THE `POST` and `DELETE` SHALL be restricted to `manager` and `super_admin`.
7. THE Profile Endpoint's `GET` SHALL return the stored logo inline as a base64 data URI, so
   that a receipt can render it with no further request and no headers.
8. WHERE a shop has no uploaded logo but has a legacy `logo_url`, THE Receipt Renderer SHALL
   print that URL, so that a shop configured before this ticket keeps the logo it had.
9. THE API SHALL expose the same three operations under `/api/admin/shops/:id/logo` for the
   super-admin console, which mounts no `resolveShop` and names its subject in the path.
10. THE Audit Event for a logo write SHALL record whether a logo is present and its type, and
    SHALL NOT contain the image bytes.
11. THE super admin's shop listing SHALL NOT carry image bytes; it SHALL carry a `has_logo`
    flag, and the image SHALL be fetched one shop at a time.

---

### Requirement 2: Receipts render from data

**User Story:** As a shop owner with two branches, I want each branch's receipts to carry its
own details, so that a customer's receipt matches the shop they were in.

#### Acceptance Criteria

1. THE Receipt Renderer SHALL accept the Receipt Profile as a parameter and SHALL contain no
   shop-specific literal.
2. THE Receipt Renderer SHALL render the shop's name, address line, contact number, logo and
   footer from that parameter.
3. THE Receipt Renderer SHALL use the shop's `receipt_paper_width_mm` for the page width, and
   the logo SHALL scale with it.
4. WHERE a Receipt Profile field is empty, THE Receipt Renderer SHALL omit the corresponding
   line entirely rather than printing an empty element.
5. WHERE the shop has neither an uploaded logo nor a `logo_url`, THE Receipt Renderer SHALL
   omit the logo block.
6. THE Receipt Renderer SHALL continue to escape all interpolated free text.
7. THE existing line-item rendering, freebie de-duplication and totals SHALL be unchanged.

---

### Requirement 3: Receipts print offline

**User Story:** As a cashier working with no connection, I want the receipt to still carry the
shop's details, so that an offline sale does not produce a blank-headed receipt.

#### Acceptance Criteria

1. THE Receipt Profile SHALL be cached so that it survives a reload with no connection.
2. THE Receipt Profile SHALL be included in the offline catalog snapshot.
3. IF no cached Receipt Profile is available, THEN THE Receipt Renderer SHALL print the sale
   with the header omitted rather than failing to print.
4. THE offline page SHALL print receipts through the same Receipt Renderer as the online
   pages.

---

### Requirement 4: The settings page

**User Story:** As a manager, I want a page to edit my shop's receipt details and see how they
will look, so that I can correct a typo without printing a test receipt.

#### Acceptance Criteria

1. THE app SHALL provide a shop-settings route restricted to `manager` and `super_admin`.
2. THE page SHALL edit every Receipt Profile field.
3. THE page SHALL show a live Receipt Preview as the fields are edited.
4. WHEN `invoice_prefix` is changed on a shop that already has sales, THE page SHALL warn that
   future receipts will look unrelated to past ones.
5. THE page SHALL appear in the navigation under the existing "Manage" group.
6. THE page SHALL offer the logo upload, and SHALL refuse a file of the wrong type or over the
   size limit in the browser rather than spending a round trip to be told.

---

### Requirement 4a: The super admin sees the receipt too

**User Story:** As a super admin setting up a new branch, I want to see the receipt it will
print, so that I can get its details right without going to that shop and printing one.

#### Acceptance Criteria

1. THE super-admin console SHALL show a live Receipt Preview beside the fields while a shop is
   being created or edited, updating as they are typed.
2. THE console's shop list SHALL offer a Receipt Preview for any shop without entering the
   editor.
3. THE Receipt Preview SHALL render the Receipt Renderer's actual output rather than a
   re-implementation of it, so that it cannot disagree with what prints.
4. THE Receipt Preview SHALL NOT show the on-page Print button, which belongs to the popup
   that prints.
5. THE super admin SHALL be able to upload and remove any shop's logo from the console.

---

### Requirement 5: Resolve the duplicate renderer

**User Story:** As a developer, I want one receipt implementation, so that a change to the
receipt cannot silently apply to only half the app.

#### Acceptance Criteria

1. THE `src/components/shared/Invoice.jsx` component SHALL be deleted, having been confirmed
   to have no importers immediately beforehand.
2. THE `react-to-print` dependency SHALL be removed from `package.json`, having been confirmed
   to have no importers.
3. AFTER this ticket, exactly one module SHALL render a receipt.

---

### Requirement 6: Existing behaviour is preserved

**User Story:** As a cashier, I want receipts to look the same as they do now for my shop, so
that nothing about the printed output surprises me.

#### Acceptance Criteria

1. FOR Shop 1, whose profile was seeded from the current literals, THE printed receipt SHALL
   be visually identical to the one printed before this ticket — including its logo, which
   `logo_url` still carries until somebody uploads one.
2. THE existing tests in `src/__tests__/printInvoice.test.js` SHALL continue to pass, updated
   only to supply the new profile parameter.
3. THE popup-blocked path, which warns and returns early, SHALL be preserved.
