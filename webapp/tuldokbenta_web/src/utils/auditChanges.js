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
//
// Everything else here is the work of shrinking that fallback. The recognised
// shapes are named and rendered in words — a sale's changed lines as the lines
// that changed, money as pesos, a list as a list — and the JSON block is left
// deliberately ugly so the next unnamed shape announces itself.

import { fieldLabel } from "./auditLabels";
import { formatCurrency } from "./format";
import { looksLikeSaleLines, diffSaleLines } from "./auditItems";

/**
 * One value, as a string.
 *
 * Objects and arrays are JSON rather than "[object Object]" — an unrecognised
 * blob is genuinely a blob, and showing it as one is honest where showing
 * nothing is not. formatFieldValue below strips most of the cases that used to
 * land here.
 */
export const formatValue = (value) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length === 0 ? "none" : JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return text.trim() === "" ? "—" : text;
};

/**
 * Fields whose value is money. Rendered with the peso sign the rest of the app
 * uses, rather than as the bare "170.00" Postgres hands back for a NUMERIC.
 *
 * An allowlist, not a guess at the name. `amount` is the obvious candidate and
 * is deliberately absent: the only `amount` any controller writes is
 * inventory.restock's, which counts bottles. "₱7.00 added" to a stock level is
 * a lie the peso sign tells on its own.
 */
const MONEY_FIELDS = new Set(["price", "total", "subtotal", "paid_amount"]);

/** A value with no interesting structure — safe to print inside a list. */
const isScalar = (value) =>
  value === null ||
  ["string", "number", "boolean"].includes(typeof value);

/**
 * One value, in the light of the field it belongs to.
 *
 * The field name is the only thing that can tell "170.00" the price from
 * "170.00" the anything-else, and it is the only thing that can turn a
 * `shop_ids` array of database ids into names a person recognises. Anything
 * this does not have an opinion about falls through to formatValue unchanged.
 *
 * @param {string} field the raw key from the payload, not its label
 * @param {unknown} value
 * @param {{shopsById?: Record<string|number, {name?: string}>}} options
 */
export const formatFieldValue = (field, value, options = {}) => {
  if (value === null || value === undefined) return "—";

  if (MONEY_FIELDS.has(field) && value !== "" && Number.isFinite(Number(value))) {
    return formatCurrency(value);
  }

  if (field === "shop_ids" && Array.isArray(value)) {
    if (value.length === 0) return "none";
    // A shop the viewer cannot see, or one deleted since, still has to name
    // itself somehow — the id is worse than a name and far better than a gap.
    return value
      .map((id) => options.shopsById?.[id]?.name ?? `Shop ${id}`)
      .join(", ");
  }

  // A list of plain values — a service's freebies, a reorder's id list — reads
  // as a list. JSON brackets and quotes carry nothing here.
  if (Array.isArray(value) && value.length > 0 && value.every(isScalar)) {
    return value.map((entry) => formatValue(entry)).join(", ");
  }

  return formatValue(value);
};

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * The `{ before, after }` pair `diff` writes, in either direction or both.
 *
 * Extra sibling keys are tolerated: inventory.restock writes
 * `{ before: {stock}, after: {stock}, amount }`, and the older rule — every key
 * must be `before` or `after` — sent it to the flat-object branch, where it
 * rendered as three one-sided JSON fragments instead of the diff it plainly is.
 * The extras are rendered after the diff rather than dropped.
 *
 * What the tolerance costs: a future flat payload with a field genuinely named
 * `before` or `after` would be read as a pair. Requiring the value to be an
 * object narrows that to a flat payload with an *object* under that name, which
 * no controller writes today — and which would still render as readable lines.
 */
const isPair = (changes) =>
  isPlainObject(changes) &&
  (Object.hasOwn(changes, "before") || Object.hasOwn(changes, "after")) &&
  ["before", "after"].every(
    (key) => !Object.hasOwn(changes, key) || isPlainObject(changes[key])
  );

/** The flat summary the sale handlers write via `saleSummary`. */
const isSaleSummary = (changes) =>
  isPlainObject(changes) && Object.hasOwn(changes, "line_count");

/**
 * A readable rendering of one `changes` payload.
 *
 * @param {unknown} changes the JSONB column, already parsed
 * @param {{shopsById?: Record<string|number, {name?: string}>}} options
 *        context the payload cannot supply for itself. Optional, so the
 *        function stays pure and testable with one argument.
 * @returns {{kind: "none"}
 *          | {kind: "text", text: string}
 *          | {kind: "lines", lines: Array<
 *              {field: string, before: string|null, after: string}
 *              | {field: string, kind: "items", items: object[]}>}
 *          | {kind: "json", text: string}}
 */
export const summarizeChanges = (changes, options = {}) => {
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
        parts.push(formatCurrency(changes.total));
      }
      if (changes.paid_using) parts.push(String(changes.paid_using));
      return { kind: "text", text: parts.join(" · ") };
    }

    if (isPair(changes)) {
      const before = isPlainObject(changes.before) ? changes.before : {};
      const after = isPlainObject(changes.after) ? changes.after : {};
      const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];

      // Siblings of the pair — restock's `amount`. One-sided, and after the
      // diff, because they annotate the change rather than being it.
      const extras = Object.keys(changes).filter(
        (key) => key !== "before" && key !== "after"
      );

      // `diff` narrows to the keys that actually changed, so an empty pair means
      // the write touched nothing worth recording — say nothing rather than
      // rendering an empty table.
      if (fields.length === 0 && extras.length === 0) return { kind: "none" };

      const lines = fields.map((field) => {
        // An `items` array is the one case where the two sides are each a whole
        // sale and the change between them is a single line. Only take this
        // path when the differ actually found something: an empty result means
        // the arrays differ in some way this cannot name, and reporting "no
        // change" for a write that changed something is the one failure worse
        // than showing the JSON.
        if (looksLikeSaleLines(before[field]) && looksLikeSaleLines(after[field])) {
          const items = diffSaleLines(before[field], after[field]);
          if (items.length > 0) {
            return { field: fieldLabel(field), kind: "items", items };
          }
        }

        return {
          field: fieldLabel(field),
          before: formatFieldValue(field, before[field], options),
          after: formatFieldValue(field, after[field], options),
        };
      });

      for (const field of extras) {
        lines.push({
          field: fieldLabel(field),
          before: null,
          after: formatFieldValue(field, changes[field], options),
        });
      }

      return { kind: "lines", lines };
    }

    // A flat object of scalars — the delete summaries, and anything shaped like
    // them — reads fine as one-sided lines with nothing on the left.
    if (isPlainObject(changes) && Object.keys(changes).length > 0) {
      return {
        kind: "lines",
        lines: Object.entries(changes).map(([field, value]) => ({
          field: fieldLabel(field),
          before: null,
          after: formatFieldValue(field, value, options),
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
