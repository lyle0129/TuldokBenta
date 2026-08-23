// utils/storage.js
// Single place that knows the localStorage key names and survives bad data.

/**
 * Queued sales made on the offline page, awaiting sync.
 *
 * One exported constant on purpose: this key was previously spelled
 * "offline_sales" in four places and "offlineSales" in a fifth, so editing an
 * offline invoice number wrote to an orphan key and was lost on reload.
 */
export const OFFLINE_SALES_KEY = "offline_sales";

/** Cached inventory + services snapshot the offline page sells from. */
export const OFFLINE_CATALOG_KEY = "offline_catalog";

/**
 * Where the offline page should resume numbering, as a bare sequence number.
 *
 * Written by the online page after every checkout, from the number the server just
 * handed out. Without it the offline page can only count from its own queue, so a
 * drained queue plus a reload restarted it at INV-0001 — guaranteeing a clash with
 * the server on the next sync.
 */
export const OFFLINE_NEXT_INVOICE_KEY = "offline_next_invoice";

/**
 * The signed-in session: access token, refresh token, user profile and shop list.
 *
 * One object under one key rather than four keys, so a half-written session is
 * not a state the app can observe — a torn write leaves the old session or none.
 */
export const SESSION_KEY = "tb_session";

/**
 * The old admin session flag, written by the password gate this release deleted.
 *
 * Nothing writes it and nothing reads it as a credential any more. It survives
 * here only so `clearSession` can delete it from a browser that ran the previous
 * build, where `authenticated: "true"` is still sitting in storage.
 */
export const LEGACY_AUTH_FLAG_KEY = "authenticated";

/**
 * Chosen colour scheme, "dark" or "light".
 *
 * Also read by an inline script in index.html, which runs before any module
 * loads and so has to spell the key literally. Keep the two in step.
 */
export const THEME_KEY = "theme";

/**
 * Reads and parses a key, falling back rather than throwing.
 *
 * A bare JSON.parse on a corrupt value throws during render and white-screens
 * the page — losing the offline sale queue with it.
 */
export const readJSON = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (error) {
    console.error(`Could not read "${key}" from localStorage:`, error);
    return fallback;
  }
};

/** Serialises and stores a value. Returns false if storage is full/unavailable. */
export const writeJSON = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Could not write "${key}" to localStorage:`, error);
    return false;
  }
};
