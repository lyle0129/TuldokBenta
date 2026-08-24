// utils/offlineMigration.js
// Moves the previous build's un-namespaced offline keys into Shop 1's namespace.
//
// A device in the shop may right now hold an unsynced sale under
// localStorage["offline_sales"] — money taken and not yet recorded anywhere else.
// Namespacing the key without moving its contents strands that sale silently,
// which is the one failure in this program that costs the shop money rather than
// convenience. Everything below is ordered around not doing that.

import { getSession } from "./session";
import {
  LEGACY_OFFLINE_CATALOG_KEY,
  LEGACY_OFFLINE_NEXT_INVOICE_KEY,
  LEGACY_OFFLINE_SALES_KEY,
  OFFLINE_MIGRATION_KEY,
  offlineCatalogKey,
  offlineNextInvoiceKey,
  offlineSalesKey,
} from "./storage";

/** Each legacy key beside the builder for the key it becomes. */
const LEGACY_KEYS = [
  [LEGACY_OFFLINE_SALES_KEY, offlineSalesKey],
  [LEGACY_OFFLINE_CATALOG_KEY, offlineCatalogKey],
  [LEGACY_OFFLINE_NEXT_INVOICE_KEY, offlineNextInvoiceKey],
];

/**
 * localStorage, or null where it is blocked (private mode, embedded webview).
 *
 * Resolved once per call rather than guarded at each access, so that a browser
 * with no usable storage makes this whole module a no-op instead of a sequence
 * of swallowed exceptions.
 */
const storage = () => {
  try {
    // The read is the test: some webviews expose the object and throw on use.
    window.localStorage.getItem(OFFLINE_MIGRATION_KEY);
    return window.localStorage;
  } catch (error) {
    console.error("localStorage is unavailable; skipping offline migration.", error);
    return null;
  }
};

/**
 * Moves every legacy key into `shopOneId`'s namespace, at most once ever.
 *
 * The order inside the loop is the whole point, and each step of it corresponds
 * to a way the naive version loses a sale:
 *
 *   - **Never overwrite a populated target.** A device that has already run the
 *     new build has real data there; a stale legacy key must not clobber it.
 *   - **Validate by parsing before moving.** Not to discard bad data — to know
 *     which branch to take.
 *   - **Keep unparseable data where it is.** An unreadable queue is not
 *     worthless: someone can read it out of devtools and re-enter the sale.
 *     Deleting it makes that impossible, so it stays and the marker is still
 *     written — retrying would never parse it either.
 *   - **Write the target, then remove the legacy key.** A crash between the two
 *     leaves both copies, which the overwrite guard handles on the next run. The
 *     reverse order loses the sale outright.
 *
 * @param {number} shopOneId the shop every pre-upgrade device belonged to
 * @returns {boolean} whether the migration ran to completion
 */
export const migrateLegacyOfflineKeys = (shopOneId) => {
  const store = storage();
  if (!store) return false;
  if (store.getItem(OFFLINE_MIGRATION_KEY)) return true;

  for (const [legacyKey, namespaced] of LEGACY_KEYS) {
    const raw = store.getItem(legacyKey);
    if (raw === null) continue;

    const target = namespaced(shopOneId);
    if (store.getItem(target) !== null) continue;

    try {
      JSON.parse(raw);
    } catch (error) {
      console.error(`Could not migrate "${legacyKey}"; leaving it in place.`, error);
      continue;
    }

    try {
      store.setItem(target, raw);
    } catch (error) {
      // Storage full. Leaving the legacy key alone is the safe half of the
      // trade: nothing has been lost, and the next load tries again.
      console.error(`Could not write "${target}"; leaving "${legacyKey}" in place.`, error);
      continue;
    }

    // Only now is it safe to drop the original.
    store.removeItem(legacyKey);
  }

  store.setItem(OFFLINE_MIGRATION_KEY, "1");
  return true;
};

/**
 * Shop 1's id, as the lowest id the session may act on.
 *
 * Every device in use before this ticket belonged to the only shop that existed,
 * so the lowest id is that shop. Resolved rather than hardcoded to `1` for the
 * same reason ticket 02's backfill resolves it — the id is a SERIAL, not a
 * constant, and a rehearsal database is entitled to disagree with production.
 */
const shopOneId = () => {
  const shops = getSession()?.shops;
  if (!Array.isArray(shops) || shops.length === 0) return null;

  const ids = shops.map((shop) => shop?.id).filter(Number.isInteger);
  return ids.length > 0 ? Math.min(...ids) : null;
};

/** Cleared only by a reload, which is also the only thing that re-runs main.jsx. */
let attemptedThisLoad = false;

/**
 * Runs the migration if it can resolve a shop to run it against.
 *
 * Called from main.jsx before the React tree mounts, and again at the offline
 * page's first namespaced read. Both, because signing in does not reload the
 * page: a boot with no session cannot resolve Shop 1, so it does nothing **and
 * writes no marker**, leaving the work for the call that happens after the
 * session exists. Between them, nothing reads a namespaced key before the legacy
 * data has had its chance to move into one.
 *
 * @returns {boolean} whether the migration has completed by the time this returns
 */
export const ensureLegacyOfflineMigration = () => {
  if (attemptedThisLoad) return true;

  const id = shopOneId();
  if (id === null) return false;

  attemptedThisLoad = migrateLegacyOfflineKeys(id);
  return attemptedThisLoad;
};

/** Test-only. Drops the once-per-load latch so a suite can run this again. */
export const resetOfflineMigrationLatch = () => {
  attemptedThisLoad = false;
};
