// queryClient.js
// The shared cache every page reads through, plus its localStorage persister.
//
// Before this existed each page instantiated its own useState-based hooks, so
// nothing was shared across routes and every mutation refetched everything —
// /open-sales cost 5 requests per mount and paying a sale cost 7.

import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

/** Where the dehydrated cache lives. Cleared on logout, so keep it findable. */
export const QUERY_CACHE_KEY = "tb_query_cache";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Every key in one place, so a read and its invalidation can't drift apart.
 *
 * Every *shop-scoped* key carries the active shop's id, and every one is a
 * function of it. Nothing in this cache is shared between shops: the entries
 * are per-tenant rows, and the cache is persisted to localStorage for a day, so
 * an unscoped key would serve the previous shop's inventory after a switch and
 * restore it from disk after a reload — silently, looking exactly like ordinary
 * staleness.
 *
 * The three admin keys at the bottom are the deliberate exception, and they are
 * grouped apart so the exception is visible rather than discovered. Those
 * screens act ACROSS shops — api.js sends no X-Shop-Id for /admin/* at all — so
 * a shop dimension on them would be a lie, and none of them is persisted.
 *
 * The resource name stays at index 0 and the shop id goes at index 1, which is
 * load-bearing in two places:
 *
 *   - shouldDehydrateQuery below filters on queryKey[0]. Prefixing with the
 *     shop instead would stop persisting everything, and the symptom is a blank
 *     first paint rather than an error.
 *   - Every closed-sales key shares the ["closedSales", shopId] prefix on
 *     purpose: one invalidation of that prefix covers every cached day and
 *     window for the shop, and no other shop's.
 */
export const queryKeys = {
  inventory: (shopId) => ["inventory", shopId],
  services: (shopId) => ["services", shopId],
  paymentMethods: (shopId) => ["paymentMethods", shopId],
  // The receipt header this shop prints. Scoped like everything else — the whole
  // point of it living in the database is that two shops print different ones.
  shopProfile: (shopId) => ["shopProfile", shopId],
  openSales: (shopId) => ["openSales", shopId],
  // Scoped like the rest: invoice series are allocated per shop, so two shops
  // legitimately preview the same number at the same time.
  nextInvoice: (shopId) => ["nextInvoice", shopId],
  closedSales: (shopId) => ["closedSales", shopId],
  closedSalesDay: (shopId, isoDate) => ["closedSales", shopId, "day", isoDate],
  // The report's window: everything created by `to` that was still unpaid at
  // `from`. Wider than the day view's slice, so it gets its own entry.
  closedSalesWindow: (shopId, from, to) => [
    "closedSales",
    shopId,
    "window",
    from,
    to,
  ],

  // ── The super-admin console: global, never persisted ──
  adminShops: () => ["adminShops"],
  adminUsers: () => ["adminUsers"],
  /**
   * One page of the audit log, keyed by the filters that produced it.
   *
   * The filter object includes the cursor, so each page of a walk is its own
   * entry and "Load more" appends rather than replacing. Paired with the short
   * gcTime in useAuditLog, so paging a long range does not accumulate every
   * page in memory for a day.
   */
  auditLog: (filters) => ["auditLog", filters],
};

/**
 * How long each resource stays fresh before a mount or refocus refetches it.
 *
 * Mutations invalidate explicitly, so these only govern how fast *another
 * device's* changes show up. Services are edited rarely; stock moves with every
 * sale; sales are the tightest because the open-sales list is what a second
 * cashier is acting on — a stale one invites paying or deleting a sale twice.
 */
export const staleTimes = {
  services: 5 * 60 * 1000,
  // Edited about as often as services — a handful of times ever.
  paymentMethods: 5 * 60 * 1000,
  // And the receipt header rather less often than that.
  shopProfile: 5 * 60 * 1000,
  inventory: 60 * 1000,
  sales: 30 * 1000,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      gcTime: DAY_MS,
      // Left at the default `true`: this is what replaces "refetch on every
      // mount" with the cheaper and fresher "refetch when the cashier comes
      // back to the tab".
      refetchOnWindowFocus: true,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: QUERY_CACHE_KEY,
});

/**
 * Resources safe to restore from disk at boot, so the first paint isn't blank.
 *
 * Exported so __tests__/queryKeys.test.js can check the names against the ones
 * queryKeys actually produces at index 0. The two drifting apart is the failure
 * that shows up as a blank first paint and nothing else.
 */
export const PERSISTED_RESOURCES = [
  "inventory",
  "services",
  "closedSales",
  // Without this the pay dialog would have an empty method dropdown until the
  // first fetch lands, which is the one moment a cashier cannot wait.
  "paymentMethods",
  // Same class of problem: a receipt printed before the first fetch lands would
  // come out with no shop name, address or logo on it, and the customer is
  // already holding it by the time anyone notices.
  "shopProfile",
];

/**
 * The keys that carry no shop, because their screens act across shops.
 *
 * Exported for the structural test that none of them is persisted. That matters
 * most for `auditLog`: writing a page of an unbounded, append-only log to
 * localStorage for 24 hours is exactly the cost the endpoint's whole design —
 * mandatory range, capped page, keyset cursor — exists to avoid. It is simply
 * correct for the other two, which are read rarely and must never be stale when
 * someone is granting or revoking access.
 */
export const GLOBAL_RESOURCES = ["adminShops", "adminUsers", "auditLog"];

export const persistOptions = {
  persister,
  maxAge: DAY_MS,
  dehydrateOptions: {
    // openSales is deliberately excluded: it is the most volatile list, and one
    // restored from disk at boot could show a cashier a sale that has already
    // been paid or deleted, inviting a double action.
    shouldDehydrateQuery: (query) =>
      query.state.status === "success" &&
      PERSISTED_RESOURCES.includes(query.queryKey[0]),
  },
};

/**
 * Drops everything cached, in memory and on disk.
 *
 * Logout used to rely on window.location.reload() to wipe state; with a
 * persisted cache that no longer holds, and sales data would outlive the
 * session in localStorage.
 */
export const clearQueryCache = () => {
  queryClient.clear();
  try {
    window.localStorage.removeItem(QUERY_CACHE_KEY);
  } catch (error) {
    console.error("Could not clear the persisted query cache:", error);
  }
};
