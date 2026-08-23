// hooks/useOfflineCatalog.js
import { useCallback, useState } from "react";
import { apiRequest } from "../api";
import { readJSON, writeJSON, OFFLINE_CATALOG_KEY } from "../utils/storage";
import { SEED_INVENTORY, SEED_SERVICES } from "../data/offlineCatalogSeed";

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
 * @returns {{
 *   inventory: Array, services: Array,
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
        syncedAt: cached.syncedAt || null,
      };
    }
    return { inventory: SEED_INVENTORY, services: SEED_SERVICES, syncedAt: null };
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      // Through apiRequest rather than a bare fetch, which is what these two
      // used to be — the only calls in the app that bypassed it. Left alone they
      // would send no Authorization header, 401 quietly, and leave this page
      // showing a stale catalog with no visible reason.
      const [inventory, services] = await Promise.all([
        apiRequest("/inventory"),
        apiRequest("/services"),
      ]);

      if (!Array.isArray(inventory) || !Array.isArray(services)) {
        throw new Error("Unexpected response shape");
      }

      const next = { inventory, services, syncedAt: new Date().toISOString() };
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
  }, []);

  return {
    inventory: catalog.inventory,
    services: catalog.services,
    lastSyncedAt: catalog.syncedAt,
    isSeed: catalog.syncedAt === null,
    refresh,
    isRefreshing,
    error,
  };
};