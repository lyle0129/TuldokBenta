# Implementation Plan: Offline Page Under Auth & Multi-Shop

## Overview

Namespace the offline storage per shop and stamp queued sales with their shop — without losing
anything already sitting on a device.

**Task 2 is the one that can cost real money.** A device may hold an unsynced sale right now.
Do it first, test it against a genuine pre-upgrade browser profile, and do not move on until
those tests pass.

## Tasks

- [x] 1. Add namespaced key builders to `src/utils/storage.js`
  - `offlineSalesKey(shopId)`, `offlineCatalogKey(shopId)`, `offlineNextInvoiceKey(shopId)`
  - Keep the three legacy names as exported constants, commented as read-only and used solely
    by the migration
  - Centralising these matters more here than anywhere else: this file already records a bug
    where the queue key was spelled two different ways and an edit wrote to an orphan key that
    vanished on reload. A computed key built inline would be that bug with more surface area
  - _Requirements: 2.1, 2.2_

- [x] 2. Create `src/utils/offlineMigration.js` and call it from `main.jsx`
  - Move each legacy key's contents to the Shop 1 namespace, in this exact order: read →
    validate by parsing → write the target → **then** remove the legacy key
  - Skip any target that already holds data; never overwrite
  - On unparseable data, leave the legacy key in place and log — an unreadable queue can still
    be recovered by hand from devtools, and deleting it makes that impossible
  - Write a done-marker so it runs at most once
  - Resolve "Shop 1" as the lowest shop id in the session rather than hardcoding `1`
  - Call it from `src/main.jsx` **before** the React tree mounts, so nothing reads a namespaced
    key first
  - _Requirements: 1.1–1.7_

- [x] 3. Test the migration before writing anything else
  - `__tests__/offlineMigration.test.js` with P1 (never loses data) and P2 (idempotent), over
    generated queue contents and a stubbed `localStorage`
  - Be exhaustive on P1. It is the only property in this program whose failure costs the shop
    money rather than convenience
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6_

- [x] 4. Make `useOfflineCatalog.js` shop-aware
  - Read and write `offlineCatalogKey(shopId)`
  - Do nothing at all when no shop is active
  - Preserve the existing behaviour that a failed refresh keeps the current snapshot rather
    than emptying it, and that the built-in seed remains the last-resort fallback with its
    banner
  - _Requirements: 2.1, 2.5, 6.3, 6.4_

- [x] 5. Stamp queued sales with their shop
  - Every queue entry records `shop_id` at the moment it is queued
  - Add an optional `shopId` option to `apiRequest` that overrides the active shop's
    `X-Shop-Id` header, used **only** by the offline sync — reading the active shop at sync
    time would be wrong, since a cashier can queue at one branch, switch, and sync later
  - A sale whose recorded shop is not in the user's current shop list renders as blocked with
    an explanation. Silently retargeting it to the active shop is the one behaviour that would
    put money in the wrong branch's books
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 6. Scope the offline invoice sequence
  - Track it under `offlineNextInvoiceKey(shopId)`
  - Preserve the existing resume rule — the greater of the cached sequence and the highest in
    the queue plus one — and the comment explaining why the queue alone is not enough
  - Take the prefix from the cached Snapshot's shop profile, falling back to the
    `INVOICE_PREFIX` constant when there is no snapshot
  - Leave the reassignment dialog exactly as it is; ticket 04 made server-side uniqueness
    per shop, which makes reassignment less likely rather than differently shaped
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 7. Handle shop switching on the offline page
  - Re-read the queue when the active shop changes, or switching leaves the previous shop's
    queue rendered against the new shop's catalog
  - **Reset `salesRef` in the same effect.** That ref exists because an in-flight sync outlives
    the `sales` snapshot its handler closed over; leaving it pointing at the old shop's array
    is exactly the bug it was introduced to fix
  - An in-flight sync may finish against its own recorded shop id — that is safe because sales
    carry their shop
  - _Requirements: 2.3, 2.4, 6.1_

- [x] 8. Protect the queue from being cleared
  - Confirm `clearQueryCache()` removes only `tb_query_cache` and add a comment there saying
    the offline queue must never be added to it
  - Confirm a shop switch and a sign-out both leave the queue intact
  - The queue is not a cache; it is the only record of a sale that has not reached the server
  - _Requirements: 5.4, 5.5_

- [x] 9. Verify the offline session behaviour
  - The offline page must be reachable with an expired access token
  - A sync failing because the server is unreachable leaves the session intact — this relies on
    ticket 07's three-outcome refresh; if that was implemented as a boolean, fix it there first
  - A sync refused by the server signs the user out and leaves the queue untouched
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 10. Add the remaining tests
  - P3 (keys are shop-distinct and never a legacy name), P4 (a queued sale syncs to its own
    shop), P5 (invoice resume is monotonic)
  - SP1: `rg -n "offline_sales|offline_catalog|offline_next_invoice" src` returns nothing
    outside `storage.js` and `offlineMigration.js`
  - _Requirements: 2.2, 3.1, 3.2, 4.3_

- [x] 11. Verification checkpoint
  - `npm run build`, `npm test` (506) and `npm run lint` all pass. Lint needed two
    pre-existing errors in `__tests__/useCart.test.js` cleared first: an unused
    `expect` import, and a `renderHook` call that rules-of-hooks rejected because the
    helper wrapping it was named `useCartWithItems` — renamed to
    `renderCartWithItems`, since it renders a hook rather than being one
  - **The manual rehearsal below is still outstanding** — it needs a browser, a real
    pre-upgrade profile and a second shop, so it is the user's to walk
  - **Rehearse the migration against a real pre-upgrade browser profile**: build the previous
    version, queue two sales offline, then load the new build over the top and confirm both
    survive, the legacy key is gone, and a second reload changes nothing. Use a real profile,
    not a hand-written `localStorage` fixture — the point is certainty about the data actually
    on the shop's devices
  - Walk the rest of the manual table from the design, including queueing at Shop A, switching
    to Shop B, and syncing the Shop A sale into Shop A
  - Confirm an hour offline does not sign anyone out
  - Confirm the offline receipt carries the right shop's header and prefix
  - Ask the user if any questions arise before closing out

## Notes

- `pages/OpenSalesOffline.jsx` is the largest file in the repo and its comments record several
  expensive bugs — the orphan storage key, the resurrected sale from a stale closure, the
  restart at `INV-0001`. Read them before editing; this ticket must not reintroduce any of them.
- Everything not named in these tasks stays exactly as it is: the per-row manual sync, the
  `syncingRef` double-click guard, edits resolving by identity rather than captured index, and
  the tolerant `readJSON`/`writeJSON` helpers.
