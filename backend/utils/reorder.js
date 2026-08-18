// utils/reorder.js
// Shared validation for the "renumber these rows 1..N" endpoints.
//
// Inventory and services both let the admin arrange their list by hand, and
// both take the whole ordered id list rather than a single swap: renumbering
// from scratch every time is self-healing, cleaning up any NULL or duplicate
// sort_order left behind by an interrupted write.
//
// Only the validation is shared. The UPDATE itself stays in each controller,
// because a table name cannot be interpolated into a neon tagged template.

/** Most rows one call may renumber, so a bogus payload can't build a huge transaction. */
export const MAX_REORDER_IDS = 500;

/**
 * A usable SERIAL id: a positive whole number, or a string spelling one.
 *
 * The looser `Number.isInteger(Number(value))` this replaces let null, "",
 * [] and false through, because Number() coerces all of them to 0. They would
 * have matched no row rather than corrupting one, but a silently ignored id in
 * a reorder means the list comes back in an order nobody asked for.
 */
const isId = (value) =>
  (typeof value === "number" || typeof value === "string") &&
  String(value).trim() !== "" &&
  Number.isInteger(Number(value)) &&
  Number(value) > 0;

/**
 * @param {unknown} orderedIds
 * @returns {string|null} why the payload is unusable, or null when it is fine
 */
export const invalidOrderedIds = (orderedIds) => {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return "`orderedIds` must be a non-empty array of ids";
  }
  if (orderedIds.length > MAX_REORDER_IDS) {
    return `Cannot reorder more than ${MAX_REORDER_IDS} rows at once`;
  }
  if (!orderedIds.every(isId)) {
    return "Every entry in `orderedIds` must be an id";
  }
  if (new Set(orderedIds.map(Number)).size !== orderedIds.length) {
    return "`orderedIds` contains duplicate ids";
  }
  return null;
};
