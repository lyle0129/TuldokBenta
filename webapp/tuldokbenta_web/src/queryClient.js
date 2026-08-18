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
 * Both closed-sales keys share the ["closedSales"] prefix on purpose: one
 * invalidation of that prefix covers the full table and every cached day.
 */
export const queryKeys = {
  inventory: ["inventory"],
  services: ["services"],
  paymentMethods: ["paymentMethods"],
  openSales: ["openSales"],
  closedSales: ["closedSales"],
  closedSalesAll: ["closedSales", "all"],
  closedSalesDay: (isoDate) => ["closedSales", "day", isoDate],
};

/**
 * How long each resource stays fresh before a mount or refocus refetches it.
 *
 * Mutations invalidate explicitly, so these only govern how fast *another
 * device's* changes show up. Services are edited rarely; stock moves with every
 * sale; sales are the tightest because OpenSales derives the next invoice
 * number from max(open ∪ closed) + 1 and a stale maximum means a duplicate the
 * server's unique constraint rejects.
 */
export const staleTimes = {
  services: 5 * 60 * 1000,
  // Edited about as often as services — a handful of times ever.
  paymentMethods: 5 * 60 * 1000,
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

/** Resources safe to restore from disk at boot, so the first paint isn't blank. */
const PERSISTED_RESOURCES = [
  "inventory",
  "services",
  "closedSales",
  // Without this the pay dialog would have an empty method dropdown until the
  // first fetch lands, which is the one moment a cashier cannot wait.
  "paymentMethods",
];

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
