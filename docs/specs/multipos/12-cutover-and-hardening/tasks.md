# Implementation Plan: Cutover & Hardening

## Overview

Turn off the compatibility bypass, verify, then delete it. Flip the flag **before** deleting
the code — flipping back is an environment-variable change, deleting is a deploy, and the
rollback lever is worth keeping while the change is newest.

## Tasks

- [ ] 1. Run the sweep in staging with the flag already off
  - Set `LEGACY_UNAUTH=false` in a non-production environment
  - Run the full sweep from the design: Shop 1 integrity, the permission matrix, isolation, the
    anonymous-request checks, and per-shop receipts, reports, offline queue and audit log
  - Do not touch production until this passes. Flipping the flag there first means discovering
    a missed `X-Shop-Id` header at the counter
  - _Requirements: 1.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ] 2. Verify Shop 1's data is intact
  - Row counts for all five scoped tables match the baselines recorded in ticket 02, task 1
  - Oldest and newest closed sales carry unchanged dates, totals and invoice numbers
  - The invoice series continues with no restart and no gap
  - A report for a month from before the upgrade shows identical figures
  - Inventory stock levels are unchanged
  - This is the only check in the program whose failure is unrecoverable, so run it first
  - _Requirements: 4.5_

- [ ] 3. Tell the shop before flipping
  - A terminal left open on the old bundle keeps working right up to the cutover and then stops
    with 401s. The fix is a reload, and nobody will guess that unless told
  - Agree a quiet window
  - _Requirements: 1.1_

- [ ] 4. Flip the flag in production
  - Set `LEGACY_UNAUTH=false` on the backend host and restart
  - Immediately confirm with `curl` that an unauthenticated request to `/api/inventory` returns
    401 and that `/api/health` still returns 200 — the keep-alive cron depends on the latter
  - Sign in on a real terminal and take a sale
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 5. Let it run for a day before deleting anything
  - The flag remains the rollback lever during the window where a problem is most likely
  - If anything goes wrong, flip it back on and investigate before proceeding
  - _Requirements: 1.4_

- [ ] 6. Delete the bypass from the middleware
  - Remove the legacy blocks from `middleware/auth.js` and `middleware/shopScope.js`
  - **Collapse `requireRealAuth` into `requireAuth`.** Once the bypass is gone they are
    identical, and two names for one behaviour is how a future route ends up on the wrong guard
  - Update the auth and admin routers to import the single name
  - _Requirements: 2.1, 2.4_

- [ ] 7. Remove the configuration
  - Delete `legacyUnauth` and `legacyShopId` from `config/env.js`
  - Delete the startup warning from `server.js`
  - Remove `LEGACY_UNAUTH` and `LEGACY_SHOP_ID` from `backend/.env.example`
  - Unset both on the production host
  - _Requirements: 2.2, 2.3_

- [ ] 8. Update the tests
  - Delete the tests asserting bypass behaviour and `requireRealAuth`'s distinct behaviour
  - **Keep the test asserting that a present-but-invalid token is rejected.** That was ticket
    03's property P6, written to guard against the bypass firing on a malformed token — the
    bypass is gone but the assertion is correct behaviour in its own right. Rewrite it to drop
    the flag, not to drop the case
  - Add SP2 as a real test: enumerate the router stack registered in `server.js` and assert that
    every route except `/api/health` returns 401 without an `Authorization` header. Enumerate
    rather than listing paths by hand, so a router mounted later is covered automatically
  - _Requirements: 1.2, 1.3, 2.5_

- [ ] 9. Clean up the remaining configuration
  - Unset `SEED_SUPERADMIN_USERNAME` and `SEED_SUPERADMIN_PASSWORD` on the production host —
    the seed has long since run
  - Confirm `VITE_ADMIN_PASSWORD` is absent from every environment and from `.env.example`
  - Review the CORS allowlist in `backend/middleware/index.js`: resolve the stale
    `// replace with your frontend` comment, and confirm the list names only origins in use.
    Note in the comment that CORS constrains browsers rather than clients and was never a
    security control here — the reason to tidy it is that a misleading comment costs someone an
    afternoon later
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 10. Run the structural check
  - `rg -n "LEGACY_UNAUTH|legacyUnauth|legacyShopId|requireRealAuth" .` returns nothing outside
    `docs/`
  - _Requirements: 2.6_

- [ ] 11. Write `docs/specs/multipos/ACCEPTED-GAPS.md`
  - The four entries from the design: reporting not enforced server-side; deactivation lag up to
    the access token's remaining lifetime; sale lines referencing inventory by name string with
    no foreign key; the hotlinked receipt logo
  - For each: what it is, why it was accepted, and what closing it would take
  - The point is that a future maintainer finding any of these does not spend a day deciding
    whether it was a mistake
  - _Requirements: 5.1, 5.2, 5.3_

- [ ] 12. Deploy and verify again
  - Deploy the bypass removal
  - Re-run the anonymous-request curl list and confirm every endpoint except `/api/health`
    returns 401
  - Re-run the permission matrix walk as each role
  - `npm test` in `backend/` and in `webapp/tuldokbenta_web/`; `npm run build` and
    `npm run lint` on the frontend
  - _Requirements: 1.2, 1.3, 4.2, 4.4_

- [ ] 13. Verification checkpoint — the program is done
  - Every ticket's checkpoint has passed
  - Shop 1's data is intact and its invoice series unbroken
  - Two shops operate independently
  - Three roles behave per the permission matrix
  - No endpoint except `/api/health` is reachable without a token
  - The audit log shows a complete record of the sweep just performed — which is itself the
    final proof that the audit path works end to end
  - Ask the user if any questions arise before closing out

## Notes

- The audit log covering the sweep is a genuinely useful last check: if the sweep's own actions
  are all in the log with the right actors and shops, the write path, the scoping and the read
  endpoint are all confirmed together.
- After this ticket the `LEGACY_UNAUTH` name should exist nowhere but in these specs, where it
  stays as the record of how the cutover was done.
