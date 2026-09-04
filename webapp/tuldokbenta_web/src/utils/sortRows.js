// utils/sortRows.js
// Comparators for the admin card lists.
//
// There are no column headers to click on — every list in this app renders
// cards — so sorting is driven by a field picked from a control rather than by
// a column name. Fields are given as accessor functions for that reason: a
// name would have to be looked up, and the moment a name can come from outside
// this module it is one refactor away from being a string the caller supplies.

/**
 * Orders two values of the same kind, ascending.
 *
 * Null and undefined always sort last regardless of direction — a user who has
 * never signed in belongs at the bottom of "Last sign-in" whichever way the
 * arrow points, because "no value" is not a value that is smaller than the
 * others. Reversing that is what `sortRows` does to everything *but* the blanks.
 *
 * Strings go through `localeCompare` so "Ángela" files next to "Angela" and
 * case does not split the list into two runs.
 */
export const compareValues = (a, b) => {
  const aMissing = a === null || a === undefined || a === "";
  const bMissing = b === null || b === undefined || b === "";
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  if (typeof a === "boolean" || typeof b === "boolean") {
    // true first, so "Active" leads under an ascending sort.
    return Number(b) - Number(a);
  }

  if (typeof a === "number" && typeof b === "number") return a - b;

  return String(a).localeCompare(String(b), undefined, {
    sensitivity: "base",
    numeric: true,
  });
};

/**
 * A sorted copy of `rows`. `accessor` pulls the value to compare out of a row.
 *
 * Copies rather than sorting in place: the array handed in is React Query's
 * cached one, and `Array.prototype.sort` mutates.
 */
export const sortRows = (rows, accessor, direction = "asc") => {
  const factor = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = accessor(a);
    const bv = accessor(b);

    // Blanks stay pinned to the bottom, so re-read the emptiness test here
    // rather than letting `factor` flip it.
    const aMissing = av === null || av === undefined || av === "";
    const bMissing = bv === null || bv === undefined || bv === "";
    if (aMissing || bMissing) return compareValues(av, bv);

    return compareValues(av, bv) * factor;
  });
};

/**
 * The slice of `rows` on `page`, 1-indexed.
 *
 * Returns the last non-empty page when `page` runs past the end, which is what
 * happens the moment a filter narrows the list under someone standing on page
 * 5. Callers still reset the page on a filter change; this is the guard for the
 * render that happens before that effect fires.
 */
export const pageSlice = (rows, page, size) => {
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * size;
  return { rows: rows.slice(start, start + size), totalPages, page: safePage };
};
