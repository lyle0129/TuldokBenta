// hooks/useOfflineCatalog.js
import { useCallback, useState } from "react";
import { apiRequest } from "../api";
import { readJSON, writeJSON, OFFLINE_CATALOG_KEY } from "../utils/storage";
import { SEED_INVENTORY, SEED_SERVICES } from "../data/offlineCatalogSeed";
import { useActiveShopId } from "./useActiveShop";

/**
 * The item and service catalog the offline sales page sells from.
 *
 * Replaces a hardcoded list that drifted from the database the moment anyone
 * edited Inventory. Since syncing an offline sale matches inventory rows by
 * `item_name` string, that drift made offline sales unsyncable.
 *
 * Resolution order is cached snapshot, then the built-in seed — so a device
 * that has never been online can still take a sale.
 *
 * The shop's receipt profile rides along in the same snapshot, which is what
 * lets an offline receipt print with a header. It lives here rather than under a
 * key of its own for the reason in the note below: one key to migrate is safer
 * than two.
 *
 * NOTE: OFFLINE_CATALOG_KEY is not yet namespaced per shop, so a user who
 * switches shops still sees the previous shop's saved catalog here until the
 * next refresh. Ticket 11 owns that key's migration — it has to move
 * `offline_sales` at the same time, and one migration over both keys is safer
 * than two. What this hook does now is refuse to *overwrite* the snapshot
 * without a shop selected, so a refresh can never write one shop's catalog
 * under another's session.
 *
 * @returns {{
 *   inventory: Array, services: Array, shop: Object|null,
 *   lastSyncedAt: string|null, isSeed: boolean,
 *   refresh: () => Promise<boolean>, isRefreshing: boolean, error: string|null,
 * }}
 */
export const useOfflineCatalog = () => {
  const [catalog, setCatalog] = useState(() => {
    const cached = readJSON(OFFLINE_CATALOG_KEY);
    if (cached?.inventory?.length || cached?.services?.length) {
      return {
        inventory: cached.inventory || [],
        services: cached.services || [],
        // Absent on a snapshot written before ticket 09. A receipt then prints
        // without a header rather than not printing at all, which is the same
        // thing that happens on a device that has never been online.
        shop: cached.shop || null,
        syncedAt: cached.syncedAt || null,
      };
    }
    return {
      inventory: SEED_INVENTORY,
      services: SEED_SERVICES,
      shop: null,
      syncedAt: null,
    };
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const shopId = useActiveShopId();

  const refresh = useCallback(async () => {
    // Every scoped endpoint answers 400 "No shop selected" to an authenticated
    // request with no X-Shop-Id, so without this the button would spend a round
    // trip to report a connection problem the user does not have.
    if (!shopId) {
      setError("Choose a shop before refreshing the catalog.");
      return false;
    }

    setIsRefreshing(true);
    setError(null);
    try {
      // Through apiRequest rather than a bare fetch, which is what these two
      // used to be — the only calls in the app that bypassed it. Left alone they
      // would send no Authorization header, 401 quietly, and leave this page
      // showing a stale catalog with no visible reason.
      const [inventory, services, shop] = await Promise.all([
        apiRequest("/inventory"),
        apiRequest("/services"),
        apiRequest("/shop-profile"),
      ]);

      if (!Array.isArray(inventory) || !Array.isArray(services)) {
        throw new Error("Unexpected response shape");
      }

      const next = {
        inventory,
        services,
        shop,
        syncedAt: new Date().toISOString(),
      };
      writeJSON(OFFLINE_CATALOG_KEY, next);
      setCatalog(next);
      return true;
    } catch (err) {
      console.error("Error refreshing offline catalog:", err);
      // Deliberately keep the existing catalog — a failed refresh while
      // offline must not leave the page with nothing to sell.
      setError("Could not reach the server. Still using the last saved catalog.");
      return false;
    } finally {
      setIsRefreshing(false);
    }
  }, [shopId]);

  return {
    inventory: catalog.inventory,
    services: catalog.services,
    shop: catalog.shop,
    lastSyncedAt: catalog.syncedAt,
    isSeed: catalog.syncedAt === null,
    refresh,
    isRefreshing,
    error,
  };
};