# Requirements: Cutover & Hardening

## Introduction

Every ticket so far has run with `LEGACY_UNAUTH=true`, so a request with no token has been
treated as a manager on Shop 1. That is what has kept the shop trading through the upgrade.

This ticket turns it off, deletes the bypass code, and closes out the loose ends the program
accumulated: CORS, the seed credentials, the deprecated environment variable, and a full
verification sweep across roles and shops.

After this ticket, an unauthenticated request to any endpoint except `/api/health` receives a
401 — the outcome the whole program exists to reach.

## Glossary

- **Bypass** — the `LEGACY_UNAUTH` code paths in `middleware/auth.js` and
  `middleware/shopScope.js`.
- **Cutover** — the moment the flag is set to false in production.
- **Sweep** — the end-to-end verification across all three roles and at least two shops.

---

## Requirements

### Requirement 1: The flag is turned off

**User Story:** As a shop owner, I want the API closed to anonymous callers, so that knowing
the URL is no longer enough to read or change my data.

#### Acceptance Criteria

1. THE `LEGACY_UNAUTH` variable SHALL be set to a value other than `"true"` in production.
2. WHEN the flag is off, EVERY endpoint except `/api/health` SHALL respond 401 to a request
   with no valid token.
3. THE `/api/health` endpoint SHALL remain reachable without authentication, so the keep-alive
   cron continues to work.
4. THE Cutover SHALL be performed only after the Sweep in Requirement 4 has passed with the
   flag off in a non-production environment.

---

### Requirement 2: The bypass code is deleted

**User Story:** As a developer, I want the temporary authentication bypass gone from the
codebase, so that it cannot be re-enabled by an environment variable set in error.

#### Acceptance Criteria

1. THE Bypass blocks SHALL be removed from `middleware/auth.js` and `middleware/shopScope.js`.
2. THE `legacyUnauth` and `legacyShopId` values SHALL be removed from `config/env.js`.
3. THE `LEGACY_UNAUTH` and `LEGACY_SHOP_ID` variables SHALL be removed from
   `backend/.env.example`.
4. THE `requireRealAuth` and `requireAuth` functions SHALL be reconciled into one, since they
   differ only by the Bypass.
5. THE tests asserting Bypass behaviour SHALL be removed, and the tests asserting that a
   present-but-invalid token is rejected SHALL be kept.
6. AFTER removal, no file in the repository SHALL contain the string `LEGACY_UNAUTH`.

---

### Requirement 3: Configuration is cleaned up

**User Story:** As an operator, I want no leftover configuration that no longer means
anything, so that the next person reading the environment is not misled.

#### Acceptance Criteria

1. THE `SEED_SUPERADMIN_USERNAME` and `SEED_SUPERADMIN_PASSWORD` variables SHALL be unset on
   the production host, the seed having already run.
2. THE `VITE_ADMIN_PASSWORD` variable SHALL be absent from every environment and from
   `.env.example`, having been removed from the code in ticket 07.
3. THE CORS allowlist in `backend/middleware/index.js` SHALL be reviewed, and its stale
   `// replace with your frontend` comment resolved.
4. THE CORS allowlist SHALL name only origins actually in use.

---

### Requirement 4: A full verification sweep

**User Story:** As a shop owner, I want the whole system exercised as each role across more
than one shop before we call this done, so that nothing was left half-connected.

#### Acceptance Criteria

1. THE Sweep SHALL be performed with at least two shops and one user of each role.
2. THE Sweep SHALL confirm the permission matrix in [the overview](../00-overview.md) holds for
   every capability listed in it.
3. THE Sweep SHALL confirm that no shop's data is visible or mutable from another shop.
4. THE Sweep SHALL confirm that an unauthenticated request receives 401 on every endpoint
   except `/api/health`.
5. THE Sweep SHALL confirm that Shop 1's pre-existing data — sales, inventory, services,
   payment methods and invoice series — is intact and unchanged.
6. THE Sweep SHALL confirm that receipts, reports, the offline queue and the audit log all
   behave correctly per shop.

---

### Requirement 5: The program's accepted gaps are recorded

**User Story:** As a future maintainer, I want the known limitations written down where I will
find them, so that I do not mistake a deliberate decision for an oversight.

#### Acceptance Criteria

1. THE repository SHALL carry a short document recording the gaps this program accepted.
2. THE record SHALL include: that reporting is hidden from workers by convenience and not
   enforced by the API; that a deactivated user's access token remains valid for up to its
   remaining lifetime; that sale line items reference inventory by name string with no foreign
   key; and that the receipt logo is hotlinked from an external host.
3. THE record SHALL state, for each gap, why it was accepted rather than closed.
