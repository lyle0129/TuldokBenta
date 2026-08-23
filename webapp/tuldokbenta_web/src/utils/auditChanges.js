// utils/auditChanges.js
// Turns an audit row's `changes` payload into something a person can read.
//
// The payload is JSONB written by eight different controllers over the life of
// this program, in at least three shapes: the `{ before, after }` pair that
// utils/audit.js's `diff` produces, the flat `{ invoice_number, line_count,
// total }` summary the sale handlers write, and whatever the ninth controller
// writes next year. There is no schema and there cannot be one — the column
// exists precisely so an action can record whatever it needs to.
//
// So the contract here is degradation, not coverage:
//
//   P4  for ANY payload — null, {}, a primitive, a deeply nested object — the
//       summariser returns something renderable and never throws
//
// A shape it does not recognise falls through to formatted JSON. That is the
// whole reason the fallback exists: raw JSON is ugly, and a blank cell where
// the evidence should be is the failure that makes the log useless to the
// person it was built for.

import { fieldLabel } from "./auditLabels";

/** Peso amount for the compact sale summary. Matches utils/format.js. */
const peso = (value) => `₱${(Number(value) || 0).toFixed(2)}`;

/**
 * One value, as a string.
 *
 * Objects and arrays are JSON rather than "[object Object]" — a changed `items`
 * array is genuinely a blob, and showing it as one is honest where showing
 * nothing is not.
 */
export const formatValue = (value) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length === 0 ? "none" : JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return text.trim() === "" ? "—" : text;
};

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** The `{ before, after }` pair `diff` writes, in either direction or both. */
const isPair = (changes) =>
  isPlainObject(changes) &&
  (Object.hasOwn(changes, "before") || Object.hasOwn(changes, "after")) &&
  Object.keys(changes).every((key) => key === "before" || key === "after");

/** The flat summary the sale handlers write via `saleSummary`. */
const isSaleSummary = (changes) =>
  isPlainObject(changes) && Object.hasOwn(changes, "line_count");

/**
 * A readable rendering of one `changes` payload.
 *
 * @param {unknown} changes the JSONB column, already parsed
 * @returns {{kind: "none"}
 *          | {kind: "text", text: string}
 *          | {kind: "lines", lines: Array<{field: string, before: string, after: string}>}
 *          | {kind: "json", text: string}}
 */
export const summarizeChanges = (changes) => {
  // One try/catch around the whole body rather than a guard per branch. P4 is a
  // property of this function, and the way to hold a property over input nobody
  // controls is to make the failure path part of the contract — an unfamiliar
  // shape becomes a JSON block, not an exception in the middle of a list.
  try {
    if (changes === null || changes === undefined) return { kind: "none" };

    if (isSaleSummary(changes)) {
      const lines = Number(changes.line_count) || 0;
      const parts = [`${lines} ${lines === 1 ? "line" : "lines"}`];
      if (changes.total !== undefined && changes.total !== null) {
        parts.push(peso(changes.total));
      }
      if (changes.paid_using) parts.push(String(changes.paid_using));
      return { kind: "text", text: parts.join(" · ") };
    }

    if (isPair(changes)) {
      const before = isPlainObject(changes.before) ? changes.before : {};
      const after = isPlainObject(changes.after) ? changes.after : {};
      const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];

      // `diff` narrows to the keys that actually changed, so an empty pair means
      // the write touched nothing worth recording — say nothing rather than
      // rendering an empty table.
      if (fields.length === 0) return { kind: "none" };

      return {
        kind: "lines",
        lines: fields.map((field) => ({
          field: fieldLabel(field),
          before: formatValue(before[field]),
          after: formatValue(after[field]),
        })),
      };
    }

    // A flat object of scalars — the delete summaries, and anything shaped like
    // them — reads fine as one-sided lines with nothing on the left.
    if (isPlainObject(changes) && Object.keys(changes).length > 0) {
      return {
        kind: "lines",
        lines: Object.entries(changes).map(([field, value]) => ({
          field: fieldLabel(field),
          before: null,
          after: formatValue(value),
        })),
      };
    }

    if (isPlainObject(changes)) return { kind: "none" };

    return { kind: "json", text: JSON.stringify(changes, null, 2) };
  } catch {
    // Reached by a payload JSON.stringify itself refuses — a cycle, a BigInt.
    // A constant rather than String(changes), which can throw in its own right
    // for an object whose `toString` is not callable. There is nothing readable
    // left at this point, and the row's other columns still say who did what to
    // which entity.
    return { kind: "json", text: "(unreadable)" };
  }
};
