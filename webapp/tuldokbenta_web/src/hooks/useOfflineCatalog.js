// hooks/useOfflineCatalog.js
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api";
import { readJSON, writeJSON, offlineCatalogKey } from "../utils/storage";
import { ensureLegacyOfflineMigration } from "../utils/offlineMigration";
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
 * key of its own because one key to migrate is safer than two.
 *
 * The snapshot is stored per shop. Two branches stock different things at
 * different prices, and a till showing the other branch's catalog would price
 * the sale wrong and then fail to sync it — the offline sync matches inventory
 * rows by `item_name`, so the names have to be the ones that shop actually has.
 * With no shop selected this reads and writes nothing at all.
 *
 * @returns {{
 *   inventory: Array, services: Array, shop: Object|null,
 *   lastSyncedAt: string|null, isSeed: boolean,
 *   refresh: () => Promise<boolean>, isRefreshing: boolean, error: string|null,
 * }}
 */

/** The built-in list, for a shop with no snapshot and for no shop at all. */
const seedCatalog = () => ({
  inventory: SEED_INVENTORY,
  services: SEED_SERVICES,
  shop: null,
  syncedAt: null,
});

/**
 * The saved snapshot for `shopId`, or the seed.
 *
 * Migrates first: signing in does not reload the page, so this can be the first
 * thing to read a namespaced key on a device whose queue is still sitting under
 * the pre-upgrade one.
 */
const loadCatalog = (shopId) => {
  if (!shopId) return seedCatalog();
  ensureLegacyOfflineMigration();

  const cached = readJSON(offlineCatalogKey(shopId));
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
  return seedCatalog();
};

export const useOfflineCatalog = () => {
  // Read before the initializer below runs, so the first paint is already this
  // shop's catalog rather than the previous one for a frame.
  const shopId = useActiveShopId();

  const [catalog, setCatalog] = useState(() => loadCatalog(shopId));

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Skips the reload on mount, which the initializer above has already done.
  const loadedFor = useRef(shopId);
  useEffect(() => {
    if (loadedFor.current === shopId) return;
    loadedFor.current = shopId;
    // A switch has to swap the catalog, not merely stop refreshing it: the
    // previous shop's items would otherwise stay on the grid, priced wrong and
    // named after rows this shop does not have.
    setCatalog(loadCatalog(shopId));
    setError(null);
  }, [shopId]);

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
      writeJSON(offlineCatalogKey(shopId), next);
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