# Requirements: Offline Page Under Auth & Multi-Shop

## Introduction

`/open-sales-offline` is a parallel till that queues sales to `localStorage` and syncs them
one at a time. Its three storage keys — `offline_sales`, `offline_catalog` and
`offline_next_invoice` — carry no shop, so with more than one shop a queued sale could sync
into the wrong one and a cached catalog could show the wrong shop's items.

This ticket namespaces those keys per shop and stamps the shop onto every queued sale.

**The migration is the risky part, and it comes first.** A real device may right now hold an
unsynced sale in `localStorage["offline_sales"]` — money the shop has taken and not yet
recorded. Renaming the key without moving its contents strands that sale silently. This is R3
in [the overview](../00-overview.md).

## Glossary

- **Queue** — the array of sales awaiting sync, in `localStorage`.
- **Snapshot** — the cached inventory, services and shop profile the offline page sells from.
- **Namespaced Key** — a storage key carrying the shop id, e.g. `offline_sales:3`.
- **Legacy Key** — the un-namespaced key used before this ticket.

---

## Requirements

### Requirement 1: No queued sale is lost

**User Story:** As a shop owner, I want a sale queued on a device before the upgrade to still
sync afterwards, so that the upgrade cannot cost me money.

#### Acceptance Criteria

1. ON first load after this ticket ships, THE app SHALL migrate the contents of each Legacy Key
   to the corresponding Namespaced Key for Shop 1.
2. THE migration SHALL run before any code reads a Namespaced Key.
3. THE migration SHALL remove the Legacy Key only after the Namespaced Key has been written
   successfully.
4. IF a Namespaced Key already holds data, THEN THE migration SHALL leave it untouched and
   SHALL NOT overwrite it with the Legacy Key's contents.
5. THE migration SHALL run at most once, and SHALL record that it has run.
6. IF a Legacy Key holds unparseable data, THEN THE migration SHALL leave it in place rather
   than discarding it, and SHALL log the problem.
7. THE migration SHALL target Shop 1 specifically, since every device in use before this ticket
   belonged to the only shop that existed.

---

### Requirement 2: Storage is namespaced per shop

**User Story:** As a manager switching between branches on one device, I want each branch's
offline queue and catalog kept separate, so that a sale queued at one branch cannot sync into
the other.

#### Acceptance Criteria

1. THE Queue, the Snapshot and the offline invoice sequence SHALL each be stored under a
   Namespaced Key.
2. THE key-building SHALL live in `src/utils/storage.js` alongside the existing key
   declarations, and SHALL NOT be constructed inline.
3. WHEN the active shop changes, THE offline page SHALL read the new shop's Queue and Snapshot
   and SHALL NOT carry the previous shop's data across.
4. THE offline data of a shop SHALL survive switching away and back.
5. WHEN no shop is active, THE offline page SHALL NOT read or write any offline key.

---

### Requirement 3: Queued sales carry their shop

**User Story:** As a developer, I want a queued sale to record which shop it belongs to, so
that syncing it cannot depend on whatever shop happens to be selected later.

#### Acceptance Criteria

1. EVERY sale added to the Queue SHALL record the shop id it was taken at.
2. WHEN a queued sale is synced, THE request SHALL carry that recorded shop id, not the
   currently active one.
3. IF a queued sale's recorded shop is no longer accessible to the signed-in user, THEN THE app
   SHALL show that sale as blocked with an explanation, and SHALL NOT sync it into a different
   shop.
4. A sale migrated from a Legacy Key SHALL be treated as belonging to Shop 1.

---

### Requirement 4: Invoice numbering is per shop and offline-safe

**User Story:** As a cashier, I want offline invoice numbers to continue sensibly for the shop
I am in, so that the printed receipt is not a duplicate of one from another branch.

#### Acceptance Criteria

1. THE offline invoice sequence SHALL be tracked per shop.
2. THE offline page SHALL render invoice numbers using the active shop's `invoice_prefix` from
   the cached Snapshot.
3. THE existing resume rule — the greater of the cached sequence and the highest sequence in
   the Queue plus one — SHALL be preserved, scoped to the shop.
4. THE existing reassignment dialog SHALL be preserved: when the server reports
   `invoice_reassigned`, the app SHALL block and ask for a reprint.

---

### Requirement 5: Working offline does not sign anyone out

**User Story:** As a cashier working with no connection, I want to stay signed in, so that the
offline till is actually usable when the connection is down.

#### Acceptance Criteria

1. THE offline page SHALL be reachable with a stored session whose access token has expired.
2. WHEN a sync attempt fails because the server is unreachable, THE app SHALL leave the session
   intact — per ticket 07's Requirement 4.4.
3. WHEN a sync attempt is refused by the server because the session is genuinely invalid, THE
   app SHALL sign the user out and SHALL leave the Queue untouched.
4. THE Queue SHALL survive a sign-out and a subsequent sign-in by the same or another user.
5. THE Queue SHALL NOT be cleared by `clearQueryCache()` or by a shop switch.

---

### Requirement 6: Existing offline behaviour is preserved

**User Story:** As a cashier, I want the offline page to work exactly as it does today, so that
the thing I rely on when the connection drops does not change under me.

#### Acceptance Criteria

1. THE per-row manual sync, the `salesRef` and `syncingRef` guards, and the edit-resolves-by-
   identity behaviour SHALL be preserved.
2. THE tolerant `readJSON` / `writeJSON` helpers SHALL continue to swallow parse errors and
   return a fallback rather than throwing during render.
3. THE "⟳ Refresh catalog" behaviour, including keeping the existing Snapshot when a refresh
   fails, SHALL be preserved.
4. THE built-in seed catalog SHALL remain the last-resort fallback, and the banner warning that
   it is in use SHALL be preserved.
5. THE offline page SHALL print through the same receipt renderer as the online pages.
