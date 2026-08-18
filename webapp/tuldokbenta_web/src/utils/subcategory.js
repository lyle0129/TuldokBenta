// utils/subcategory.js
// Item subcategories for the sale catalog.
//
// Items carry their group twice over: as a "[Detergent] " prefix on the name,
// and in the item_classification column. The prefix is the older of the two —
// it was how ORDER BY item_name was forced into groups before items had an
// order of their own — and only 10 of the 14 items ever got one.
//
// So: read the prefix first, fall back to the column. Where both exist they
// already agree, and the fallback means Bleach, Plastic and the Spincredible
// items group correctly without anyone having to rename them.

const BRACKET_PREFIX = /^\s*\[([^\]]+)\]/;

export const UNCATEGORIZED = "Uncategorized";

/** The subcategory one item belongs to. Never empty. */
export const subcategoryOf = (item) => {
  const bracket = BRACKET_PREFIX.exec(item?.item_name ?? "")?.[1];
  const label = (bracket ?? item?.item_classification ?? "").trim();
  return label || UNCATEGORIZED;
};

/**
 * Display form of a subcategory name.
 *
 * Classifications are typed by hand, so the data has "bleach" sitting next to
 * "Detergent" and "Fabcon". Capitalising the first letter keeps one odd chip
 * from looking like a bug; the stored value is left alone.
 */
export const subcategoryLabel = (name) =>
  name ? name.charAt(0).toUpperCase() + name.slice(1) : name;

/**
 * Every subcategory present, in the order its first item appears.
 *
 * Inventory arrives in the admin's own sort_order, so the chips follow the
 * ordering set on the Inventory page rather than an alphabetical one.
 */
export const subcategoriesOf = (items = []) => {
  const seen = new Map(); // lowercased key -> first-seen spelling
  for (const item of items) {
    const name = subcategoryOf(item);
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()];
};

/** Case-insensitive, because "bleach" and "Bleach" are the same shelf. */
export const matchesSubcategory = (item, subcategory) =>
  subcategoryOf(item).toLowerCase() === String(subcategory).toLowerCase();