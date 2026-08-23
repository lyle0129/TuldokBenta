// utils/session.js
// The signed-in session, and who to tell when it changes.
//
// Replaces utils/auth.js, which held a boolean set by comparing a typed password
// against a Vite-inlined env var in the browser. This holds the real thing: the
// tokens the API issues, the profile behind them, and the shops that profile may
// act on.
//
// Deliberately contains no network code. api.js imports from here to read the
// token and to clear a dead session; nothing here imports api.js. That one-way
// edge is what keeps the two out of an import cycle — see the ticket 07 design.

import {
  ACTIVE_SHOP_KEY,
  LEGACY_AUTH_FLAG_KEY,
  SESSION_KEY,
  readJSON,
  writeJSON,
} from "./storage";

const listeners = new Set();

/**
 * The parsed session, plus the exact string it was parsed from.
 *
 * Caching is the one thing utils/auth.js could get away with not doing and this
 * cannot. `getSession` is the `getSnapshot` for useSyncExternalStore, which
 * compares snapshots by identity: a boolean read fresh from storage each time
 * compares equal, but a freshly parsed object never does, and React re-renders
 * forever.
 *
 * Keying the cache on the raw string rather than on a "have I read it yet" flag
 * is what keeps it honest. The comparison is a cheap synchronous getItem, and it
 * means storage being cleared behind our back — which the tests do between every
 * run — is noticed rather than papered over by a stale object.
 */
let cachedRaw;
let cached = null;

/** @returns {{accessToken: string, refreshToken: string, user: object, shops: Array}|null} */
export const getSession = () => {
  let raw;
  try {
    raw = localStorage.getItem(SESSION_KEY);
  } catch {
    // Storage blocked (private mode, embedded webview). Fail closed, the same
    // way the flag this replaced did.
    return null;
  }

  if (raw !== cachedRaw) {
    cachedRaw = raw;
    // readJSON swallows a corrupt value and returns the fallback, so a mangled
    // session reads as signed out rather than white-screening the app.
    cached = readJSON(SESSION_KEY, null);
  }
  return cached;
};

/** Drops the flag the previous build left behind. Cheap, and runs on every write. */
const dropLegacyFlag = () => {
  try {
    localStorage.removeItem(LEGACY_AUTH_FLAG_KEY);
  } catch {
    // Storage blocked. There is nothing to clean up in that case anyway.
  }
};

export const setSession = (session) => {
  writeJSON(SESSION_KEY, session);
  // Seeded rather than left for the next getSession to parse, so callers get
  // back the very object they passed in — and so a write that storage refused
  // still produces a working in-memory session for this page load.
  cached = session;
  cachedRaw = JSON.stringify(session);
  dropLegacyFlag();
  notify();
};

export const clearSession = () => {
  cached = null;
  cachedRaw = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.error("Could not clear the session:", error);
  }
  dropLegacyFlag();
  // Signing out drops the shop with the session. Leaving it behind would hand
  // the next person at a shared terminal a pre-selected shop that has nothing
  // to do with their own assignments.
  writeActiveShop(null);
  notify();
};

export const subscribeSession = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const notify = () => listeners.forEach((listener) => listener());

export const getAccessToken = () => getSession()?.accessToken ?? null;

export const getRole = () => getSession()?.user?.role ?? null;

// ---------------------------------------------------------------------------
// The active shop.
//
// Deliberately in this module rather than one of its own, and deliberately
// sharing the listener set above. Both are read by useSyncExternalStore, and a
// second store would mean a second subscription in every component that needs
// both — plus two notifications for the one event that changes both, which is
// signing out.
// ---------------------------------------------------------------------------

/**
 * Cached the same way the session is, and for the same reason.
 *
 * The value here is a number, so `getSnapshot` identity would be safe even
 * re-read from storage each time. The cache is kept anyway because the
 * comparison also keeps this honest about storage being cleared behind our
 * back — which the tests do between every run.
 */
let cachedShopRaw;
let cachedShopId = null;

/** @returns {number|null} the active shop's id, or null if none is selected */
export const getActiveShopId = () => {
  let raw;
  try {
    raw = localStorage.getItem(ACTIVE_SHOP_KEY);
  } catch {
    // Storage blocked (private mode, embedded webview). No selection, which
    // routes the user to the picker rather than guessing a shop for them.
    return null;
  }

  if (raw !== cachedShopRaw) {
    cachedShopRaw = raw;
    const parsed = Number(raw);
    // A non-numeric or non-positive value reads as "nothing selected" rather
    // than travelling on to resolveShop, which would answer 400 to every query
    // on the page with no explanation of why.
    cachedShopId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return cachedShopId;
};

/** Writes through to storage and seeds the cache. Pass null to clear. */
const writeActiveShop = (shopId) => {
  cachedShopId = shopId;
  cachedShopRaw = shopId === null ? null : String(shopId);
  try {
    if (shopId === null) localStorage.removeItem(ACTIVE_SHOP_KEY);
    else localStorage.setItem(ACTIVE_SHOP_KEY, String(shopId));
  } catch (error) {
    console.error("Could not store the active shop:", error);
  }
};

/**
 * Selects a shop.
 *
 * Note this does NOT clear the query cache — `setShop` in hooks/useActiveShop.js
 * does that first, and the order matters. See the comment there.
 */
export const setActiveShopId = (shopId) => {
  writeActiveShop(shopId);
  notify();
};

export const clearActiveShop = () => {
  writeActiveShop(null);
  notify();
};
