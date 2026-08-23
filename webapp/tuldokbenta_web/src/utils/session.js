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

import { LEGACY_AUTH_FLAG_KEY, SESSION_KEY, readJSON, writeJSON } from "./storage";

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
  notify();
};

export const subscribeSession = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const notify = () => listeners.forEach((listener) => listener());

export const getAccessToken = () => getSession()?.accessToken ?? null;

export const getRole = () => getSession()?.user?.role ?? null;
