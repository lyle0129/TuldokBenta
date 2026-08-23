// hooks/useActiveShop.js
// Which shop the UI is acting on, and the list it may choose from.
//
// Two hooks rather than one, deliberately. Every data hook in the app needs the
// id and nothing else; only the picker and /select-shop need the list. Merging
// them would make a super admin's shop-list fetch fire once per data hook per
// page — five requests to render a till.

import { useEffect, useState, useSyncExternalStore } from "react";
import { apiRequest } from "../api";
import { clearQueryCache } from "../queryClient";
import {
  getActiveShopId,
  setActiveShopId,
  subscribeSession,
} from "../utils/session";
import { useAuth } from "./useAuth";

/** Shared so a session with no shops returns a stable reference between renders. */
const EMPTY = [];

/**
 * The active shop's id, re-rendering when it changes.
 *
 * The one every query key is built from. Subscribes to the session store rather
 * than a store of its own, so a sign-out — which clears both — re-renders once.
 *
 * @returns {number|null}
 */
export const useActiveShopId = () =>
  useSyncExternalStore(subscribeSession, getActiveShopId, getActiveShopId);

/**
 * The super admin's shop list, fetched at most once per page load.
 *
 * Module-level rather than component state because useActiveShop has two
 * callers on every guarded page — RequireRole and the navbar's ShopPicker — and
 * RequireRole remounts on every navigation. Without this, a super admin would
 * spend two GETs per route change asking the same question.
 *
 * Not routed through TanStack Query on purpose: every key in queryKeys carries a
 * shop id, and this list is account-level data that is identical under every
 * shop. Giving it a shop dimension would refetch it on each switch to get the
 * same answer; exempting one key from the rule would weaken a property the
 * cache's correctness rests on.
 */
let shopListRequest = null;

/** Dropped on sign-out, so the next person at the terminal starts clean. */
export const forgetShopList = () => {
  shopListRequest = null;
};

/**
 * The shops this session may act on.
 *
 * For every role but super admin this is `session.shops` and costs no request:
 * the login response already carries exactly the assignments the picker should
 * offer.
 *
 * A super admin's list is fetched from /auth/me. The server resolves a super
 * admin's shops to *every active shop* rather than to their assignments
 * (authController.shopsForUser), which is the same rule resolveShop enforces —
 * so the list can never offer a shop the middleware would then refuse. The fetch
 * exists so that a shop created after sign-in is switchable without signing out
 * (requirement 2.2); `session.shops` renders meanwhile, so there is no loading
 * state to show and no flash on navigation.
 */
const useAvailableShops = () => {
  const session = useAuth();
  const sessionShops = session?.shops ?? EMPTY;
  const isSuperAdmin = session?.user?.role === "super_admin";

  const [fetched, setFetched] = useState(null);

  useEffect(() => {
    if (!isSuperAdmin) {
      // Covers a demotion mid-session: drop a list gathered under the wider rule
      // rather than keeping it on screen.
      setFetched(null);
      return;
    }

    shopListRequest ??= apiRequest("/auth/me").catch((error) => {
      // Falls through to session.shops, which for a super admin was every active
      // shop as of sign-in — stale by at most whatever was created since. A
      // warning rather than an error banner: the picker still works.
      console.warn("Could not refresh the shop list:", error);
      // Cleared so a later mount can try again rather than caching the failure
      // for the rest of the page's life.
      shopListRequest = null;
      return null;
    });

    let cancelled = false;
    shopListRequest.then((result) => {
      if (!cancelled && Array.isArray(result?.shops)) setFetched(result.shops);
    });

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  return fetched ?? sessionShops;
};

/**
 * The full picker state.
 *
 * @returns {{
 *   shopId: number|null,
 *   shop: {id: number, name: string, slug: string}|null,
 *   shops: Array<{id: number, name: string, slug: string}>,
 *   setShop: (id: number) => void,
 * }}
 */
export const useActiveShop = () => {
  const stored = useActiveShopId();
  const shops = useAvailableShops();

  // Requirement 1.6: a stored shop that is no longer available is discarded
  // rather than sent. It is a real state — an assignment revoked between two
  // sessions, or a shop deactivated — and sending it would earn a 403 on every
  // query instead of a picker.
  //
  // Requirement 1.2: one shop is not a choice, so it resolves here rather than
  // being offered. Resolving it during render rather than in the effect below is
  // what keeps a single-shop worker off the picker entirely: RequireRole reads
  // this on its first render, and a null there would redirect to /select-shop
  // before any effect could auto-select, bouncing the user through a screen they
  // are never meant to see.
  const only = shops.length === 1 ? shops[0] : null;
  const shop = shops.find((s) => s.id === stored) ?? only;
  const shopId = shop?.id ?? null;

  // Persist what was resolved above, so the choice survives a reload and so the
  // query keys — which read the store, not this hook — pick it up.
  useEffect(() => {
    if (shop && shop.id !== stored) setActiveShopId(shop.id);
  }, [shop, stored]);

  return { shopId, shop, shops, setShop };
};

/**
 * Switches shops.
 *
 * Clear first, then write. Setting the id first would let queries already in
 * flight for the old shop resolve into the new shop's cache entries — the exact
 * cross-shop bleed the scoped keys exist to prevent, arriving through the one
 * window where the key is chosen before the response lands.
 *
 * Clearing costs a refetch on every switch. That is the intended trade: managers
 * switch a few times a day, and the alternative is a localStorage cache
 * accumulating every shop's sales history on a shared terminal, bounded only by
 * its 24-hour maxAge.
 *
 * A plain function rather than something returned by the hook alone, so
 * SelectShop can call it from a click handler without threading it through.
 * Note api.js does NOT import this: it clears the shop through utils/session.js
 * directly, because importing a hooks module from there would close the
 * api -> session edge into the import cycle that module is factored to avoid.
 */
export const setShop = (id) => {
  if (id === getActiveShopId()) return;
  clearQueryCache();
  setActiveShopId(id);
};
