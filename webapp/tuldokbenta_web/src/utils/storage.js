// utils/storage.js
// Single place that knows the localStorage key names and survives bad data.

// ---------------------------------------------------------------------------
// The offline page's three keys.
//
// Each is now `<name>:<shopId>`. Two shops on one device must not share a queue,
// a catalog or an invoice series: a sale queued at one branch syncing into the
// other is money in the wrong books.
//
// Building these inline was never an option. This file exists because the queue
// key was once spelled "offline_sales" in four places and "offlineSales" in a
// fifth, so editing an offline invoice number wrote to an orphan key and was
// lost on reload. A *computed* key spread across call sites would be that same
// bug with more surface area.
// ---------------------------------------------------------------------------

/**
 * The un-namespaced names the previous build wrote.
 *
 * Read by utils/offlineMigration.js and by nothing else, ever. They are here
 * rather than inlined there so that the one file naming these strings is still
 * the one file that names all of them.
 */
export const LEGACY_OFFLINE_SALES_KEY = "offline_sales";
export const LEGACY_OFFLINE_CATALOG_KEY = "offline_catalog";
export const LEGACY_OFFLINE_NEXT_INVOICE_KEY = "offline_next_invoice";

/** Queued sales made on the offline page for `shopId`, awaiting sync. */
export const offlineSalesKey = (shopId) => `${LEGACY_OFFLINE_SALES_KEY}:${shopId}`;

/** Cached inventory, services and receipt profile the offline page sells from. */
export const offlineCatalogKey = (shopId) =>
  `${LEGACY_OFFLINE_CATALOG_KEY}:${shopId}`;

/**
 * Where the offline page should resume numbering, as a bare sequence number.
 *
 * Written by the online page after every checkout, from the number the server just
 * handed out. Without it the offline page can only count from its own queue, so a
 * drained queue plus a reload restarted it at INV-0001 — guaranteeing a clash with
 * the server on the next sync.
 */
export const offlineNextInvoiceKey = (shopId) =>
  `${LEGACY_OFFLINE_NEXT_INVOICE_KEY}:${shopId}`;

/**
 * Set once the legacy keys above have been moved into a shop's namespace.
 *
 * Its absence is what lets the migration run; its presence is what stops it
 * running on every load forever.
 */
export const OFFLINE_MIGRATION_KEY = "tb_offline_migrated";

/**
 * The signed-in session: access token, refresh token, user profile and shop list.
 *
 * One object under one key rather than four keys, so a half-written session is
 * not a state the app can observe — a torn write leaves the old session or none.
 */
export const SESSION_KEY = "tb_session";

/**
 * The shop the UI is currently acting on, as a bare numeric id.
 *
 * Stored beside SESSION_KEY rather than inside it on purpose. A token refresh
 * rewrites the whole session object from the server's response — which carries
 * `user` and `shops` but has no notion of which one is selected — so a selection
 * kept inside it would be dropped every time the access token rolled over.
 */
export const ACTIVE_SHOP_KEY = "tb_active_shop";

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
