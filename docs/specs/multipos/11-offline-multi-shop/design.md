# Design: Offline Page Under Auth & Multi-Shop

## Overview

Namespace three `localStorage` keys per shop, stamp the shop onto queued sales, and migrate
whatever is already on a device into Shop 1's namespace without losing it.

Everything else about `pages/OpenSalesOffline.jsx` — the largest file in the repo, and the one
with the most hard-won defensive behaviour — stays as it is. The file's existing comments
record several bugs that were expensive to find; this ticket must not reintroduce any of them.

---

## The migration

This runs once, at module load, before any component reads an offline key.

```js
// src/utils/offlineMigration.js
const LEGACY = {
  offline_sales: (id) => `offline_sales:${id}`,
  offline_catalog: (id) => `offline_catalog:${id}`,
  offline_next_invoice: (id) => `offline_next_invoice:${id}`,
};

export const migrateLegacyOfflineKeys = (shopOneId = 1) => {
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return;

  for (const [legacyKey, namespaced] of Object.entries(LEGACY)) {
    const raw = localStorage.getItem(legacyKey);
    if (raw === null) continue;

    const target = namespaced(shopOneId);
    // Never overwrite. A device that has already run the new build has real data here.
    if (localStorage.getItem(target) !== null) continue;

    try {
      JSON.parse(raw);            // validate before moving
    } catch (error) {
      // Leave the legacy key in place. Unparseable is not the same as worthless —
      // a queued sale that failed to serialise is still recoverable by hand, and
      // deleting it is not.
      console.error(`Could not migrate ${legacyKey}; leaving it in place.`, error);
      continue;
    }

    localStorage.setItem(target, raw);
    // Only now is it safe to drop the original.
    localStorage.removeItem(legacyKey);
  }

  localStorage.setItem(MIGRATION_DONE_KEY, "1");
};
```

Four properties this ordering gives, each corresponding to a way the naive version loses data:

- **Write before delete.** A crash between the two leaves both copies, which the
  `getItem(target) !== null` guard then handles on the next run. The reverse order loses the
  sale.
- **Never overwrite a populated target.** Prevents a stale legacy key from clobbering real
  data on a device that has already been running the new build.
- **Validate before moving, keep on failure.** An unparseable queue is not worthless — someone
  can read it out of devtools and re-enter the sale. Discarding it makes that impossible.
- **A done-marker.** So the migration is not attempted on every load forever.

Shop 1 is the target because every device in use before this ticket belonged to the only shop
that existed. Resolve "Shop 1" as the lowest shop id from the session's shop list rather than
hardcoding `1`, for the same reason ticket 02's backfill does.

Call it once from `src/main.jsx`, before the React tree mounts.

---

## Architecture

```
src/
├── utils/
│   ├── storage.js            ← + key builders; legacy names kept as constants for the migration
│   └── offlineMigration.js   ← NEW
├── main.jsx                  ← calls the migration before render
├── hooks/useOfflineCatalog.js ← reads/writes the namespaced snapshot
└── pages/OpenSalesOffline.jsx ← shop-aware queue, shop-stamped sales
```

### `storage.js`

```js
// Legacy names. Read only by offlineMigration.js. Do not use elsewhere.
export const LEGACY_OFFLINE_SALES_KEY = "offline_sales";
export const LEGACY_OFFLINE_CATALOG_KEY = "offline_catalog";
export const LEGACY_OFFLINE_NEXT_INVOICE_KEY = "offline_next_invoice";

export const offlineSalesKey       = (shopId) => `offline_sales:${shopId}`;
export const offlineCatalogKey     = (shopId) => `offline_catalog:${shopId}`;
export const offlineNextInvoiceKey = (shopId) => `offline_next_invoice:${shopId}`;
```

Centralising these matters more here than anywhere else in the app. `storage.js` already
carries a comment recording a bug where the queue key was spelled `offline_sales` in four
places and `offlineSales` in a fifth, so editing an offline invoice number wrote to an orphan
key and vanished on reload. Introducing a *computed* key without centralising it would be that
bug with more surface area.

---

## Components and Interfaces

### Shop-stamped queue entries

```js
{ invoice_number, invoice_seq, items, customer_name, date, shop_id }
```

`shop_id` is recorded at the moment the sale is queued and is what the sync sends
(Requirement 3.2). Reading the *active* shop at sync time would be wrong: a cashier can queue
sales at one branch, switch, and sync later.

Because `X-Shop-Id` is attached from the active shop by ticket 08's `apiRequest`, syncing a
queued sale needs an explicit per-request override. Add an optional `shopId` option to
`apiRequest` that takes precedence over the active shop — used only by the offline sync.

A sale whose recorded shop is not in the user's current shop list renders as blocked with an
explanation rather than syncing anywhere (Requirement 3.3). Silently retargeting it to the
active shop is the one behaviour that would put money in the wrong branch's books.

### Invoice numbering

The existing resume rule is preserved and scoped:

> the greater of the cached `offline_next_invoice:{shopId}` and the highest sequence in that
> shop's queue plus one

The file's own comment explains why the queue alone is not enough — it empties as sales sync,
so a reload restarted at `INV-0001` and guaranteed a server collision. That reasoning is
unchanged; only the storage key gains a shop.

The prefix now comes from the cached Snapshot's shop profile (ticket 09) rather than the
`INVOICE_PREFIX` constant. With no Snapshot, fall back to the constant — a receipt with a
default prefix beats no receipt.

The reassignment dialog stays exactly as it is. Ticket 04 made the server's uniqueness check
per shop, which makes reassignment *less* likely, not differently shaped.

### Reacting to a shop switch

`OpenSalesOffline.jsx` reads the queue into state on mount. With a shop dimension it must also
re-read when the active shop changes — otherwise switching shops leaves the previous shop's
queue rendered against the new shop's catalog.

The existing `salesRef` mirror must be reset in the same effect. That ref exists because an
in-flight sync outlives the `sales` snapshot its handler closed over, and leaving it pointing
at the old shop's array is precisely the class of bug it was introduced to fix.

Guard the switch while a sync is in flight: either block it or let the in-flight sync finish
against its recorded shop id. Because sales carry their own `shop_id`, the latter is safe and
simpler.

---

## Data Models

| Key | Contents |
|---|---|
| `offline_sales:{shopId}` | Queue, entries now carrying `shop_id` |
| `offline_catalog:{shopId}` | `{ inventory, services, shop, syncedAt }` — `shop` added in ticket 09 |
| `offline_next_invoice:{shopId}` | Bare sequence number |
| `tb_offline_migrated` | Done-marker, written once |

The Queue is deliberately **not** cleared by `clearQueryCache()` or by a shop switch
(Requirement 5.5). It is not a cache — it is the only record of a sale that has not reached the
server. `clearQueryCache` today removes only `tb_query_cache`, so this holds as long as nobody
widens it; add a comment there saying so.

---

## Error Handling

| Condition | Behaviour |
|---|---|
| Legacy key present, target empty | Migrated, legacy key removed |
| Legacy key present, target populated | Legacy key left alone; nothing overwritten |
| Legacy key unparseable | Left in place, error logged, migration continues |
| `localStorage` unavailable | Migration is a no-op; the offline page degrades as it does today |
| Sync fails, server unreachable | Session kept; sale stays queued; existing error shown |
| Sync refused as unauthenticated | User signed out; **Queue untouched** |
| Queued sale's shop no longer accessible | Row shown as blocked with an explanation; no sync |
| No active shop | Offline page reads and writes nothing |
| No cached Snapshot | Built-in seed catalog and its existing banner, as today |

---

## Correctness Properties

### P1 — Migration never loses data

For any combination of present/absent, parseable/unparseable legacy keys and populated/empty
targets, after migration every sale that existed before is readable from either the legacy key
or the namespaced key.

*Validates: 1.1, 1.3, 1.4, 1.6*

### P2 — Migration is idempotent

Running the migration any number of times produces the same storage state as running it once.

*Validates: 1.5*

### P3 — Keys are shop-distinct

For any two distinct shop ids, all three key builders produce distinct strings, and no builder
produces a legacy key name.

*Validates: 2.1, 2.2*

### P4 — A queued sale syncs to its own shop

For any queue and any active shop, each sync request carries the sale's recorded `shop_id`,
never the active one.

*Validates: 3.1, 3.2*

### P5 — Invoice resume is monotonic

For any cached sequence and any queue, the resumed sequence is greater than every sequence
already present in that shop's queue.

*Validates: 4.3*

### Structural property SP1 — no inline offline key

```powershell
rg -n "offline_sales|offline_catalog|offline_next_invoice" webapp/tuldokbenta_web/src |
  rg -v "utils/storage.js|utils/offlineMigration.js"
```
returns nothing.

*Validates: 2.2*

P1 is the property to be exhaustive about. It is the only one where a failure costs the shop
real money rather than an inconvenience.

---

## Testing Strategy

### Property tests

P1–P5 in `src/__tests__/offlineMigration.test.js` and `offlineKeys.test.js`, using `fast-check`
over generated queue contents and a stubbed `localStorage`.

### Manual verification — the migration especially

Rehearse against a browser profile that genuinely holds pre-upgrade data. Build the previous
version, queue two sales offline, then load the new build over the top.

| Step | Confirms |
|---|---|
| Load the new build with a legacy queue present | Both sales appear, now under Shop 1 |
| Inspect `localStorage` | `offline_sales` gone, `offline_sales:1` present, marker written |
| Reload again | Nothing changes; the migration does not re-run |
| Corrupt the legacy key, load a fresh profile | Key left in place; an error logged; the page still renders |
| Queue a sale at Shop A, switch to Shop B | Shop B's queue is empty; Shop A's is not lost |
| Switch back to Shop A | The queued sale is still there |
| Sync it while Shop B is active | It lands in Shop A |
| Go offline, take a sale, print | Receipt carries Shop A's header and prefix |
| Go offline for over an hour, then act | Still signed in; the sync fails with a connection error |
| Come back online, sync | Succeeds without a re-login |
| Revoke access to Shop A, reload | The queued Shop A sale shows as blocked, not synced elsewhere |
| Sign out with a sale queued, sign back in | The sale is still queued |

The first four rows are the migration. Run them on a real pre-upgrade profile, not a
hand-written `localStorage` fixture — the point is to be sure about the data that actually
exists on the shop's devices.
