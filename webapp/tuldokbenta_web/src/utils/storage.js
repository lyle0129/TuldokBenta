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

/** Admin session flag, written by the password gate. */
export const AUTH_KEY = "authenticated";

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
