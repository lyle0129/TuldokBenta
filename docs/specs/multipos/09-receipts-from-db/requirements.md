# Requirements: DB-Driven Receipts & Shop Profile

## Introduction

Receipt identity is hardcoded. `src/utils/printInvoice.js` builds its HTML from a template
string containing the literal shop name, address line, mobile number, logo URL, footer text
and 58 mm paper width. A second shop printing from this app would print the first shop's
details.

This ticket moves those values into the shop's Receipt Profile — already in the `shops` table
since ticket 02 — adds a manager-editable settings page, and makes the profile available
offline so a receipt printed without a connection still carries a header.

It also resolves `src/components/shared/Invoice.jsx`, a React component that duplicates every
one of those literals and which nothing imports.

## Glossary

- **Receipt Profile** — the `shops` columns a printed receipt renders: name, address line,
  contact number, logo URL, footer text, paper width and invoice prefix.
- **Profile Endpoint** — the shop-scoped route serving and updating the Receipt Profile.
- **Receipt Renderer** — `src/utils/printInvoice.js`.

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

### Requirement 2: Receipts render from data

**User Story:** As a shop owner with two branches, I want each branch's receipts to carry its
own details, so that a customer's receipt matches the shop they were in.

#### Acceptance Criteria

1. THE Receipt Renderer SHALL accept the Receipt Profile as a parameter and SHALL contain no
   shop-specific literal.
2. THE Receipt Renderer SHALL render the shop's name, address line, contact number, logo and
   footer from that parameter.
3. THE Receipt Renderer SHALL use the shop's `receipt_paper_width_mm` for the page width.
4. WHERE a Receipt Profile field is empty, THE Receipt Renderer SHALL omit the corresponding
   line entirely rather than printing an empty element.
5. WHERE the logo URL is empty, THE Receipt Renderer SHALL omit the logo block.
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
3. THE page SHALL show a live preview of the receipt header as the fields are edited.
4. WHEN `invoice_prefix` is changed on a shop that already has sales, THE page SHALL warn that
   future receipts will look unrelated to past ones.
5. THE page SHALL appear in the navigation under the existing "Manage" group.

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
   be visually identical to the one printed before this ticket.
2. THE existing tests in `src/__tests__/printInvoice.test.js` SHALL continue to pass, updated
   only to supply the new profile parameter.
3. THE popup-blocked path, which warns and returns early, SHALL be preserved.
