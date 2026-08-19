// utils/saleItems.js
// Helpers for reasoning about the JSONB `items` array stored on open_sales /
// closed_sales. Kept pure so the controllers stay thin.

/**
 * Does this sale line represent something that comes out of inventory?
 *
 * Older rows (and sales synced up from the offline page) don't always carry a
 * `type` discriminator, so fall back to the presence of `item_name`. Without
 * this fallback those lines silently skip both deduction and restocking, and
 * stock drifts with no error anywhere.
 */
export const isInventoryLine = (line) =>
  !!line && (line.type === "item" || (!line.type && !!line.item_name));

/**
 * Net stock change per item name when a sale goes from `oldItems` to `newItems`.
 *
 * Positive = give stock back, negative = take stock away. Both sides are
 * aggregated by name first, which is what makes duplicate lines correct: the UI
 * appends a second line for an item already on the sale rather than
 * incrementing it, and checking each line independently against the same stock
 * lets a sale pass validation it cannot actually afford.
 *
 * Pass `[]` for oldItems on create, or `[]` for newItems on delete.
 *
 * @returns {Map<string, number>} names to non-zero deltas
 */
export const stockDeltas = (oldItems = [], newItems = []) => {
  const deltas = new Map();

  const accumulate = (items, sign) => {
    for (const line of items) {
      if (!isInventoryLine(line)) continue;
      const name = line.item_name;
      const qty = Number(line.qty) || 0;
      deltas.set(name, (deltas.get(name) || 0) + sign * qty);
    }
  };

  accumulate(oldItems, 1); // restore what the sale used to hold
  accumulate(newItems, -1); // take what it holds now

  for (const [name, delta] of deltas) {
    if (delta === 0) deltas.delete(name); // no-op, don't touch the row
  }

  return deltas;
};

/**
 * Throws an Error with `.status = 400` if the items payload is unusable.
 *
 * Guards two real failure modes: a missing/!iterable `items` (which used to
 * throw mid-way through the stock loop, after inventory had already been
 * credited) and a negative qty (which inflates stock, since deduction is
 * `stock - qty`).
 */
export const validateItems = (items) => {
  if (!Array.isArray(items)) {
    throw badRequest("`items` must be an array");
  }

  for (const line of items) {
    if (!line || typeof line !== "object") {
      throw badRequest("Each sale item must be an object");
    }

    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty < 1) {
      const label = line.item_name || line.service_name || "item";
      throw badRequest(`Invalid quantity for ${label} — must be a whole number of at least 1`);
    }

    if (isInventoryLine(line) && !line.item_name) {
      throw badRequest("Inventory lines must have an item_name");
    }
  }
};

export const badRequest = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

/** The column's own width, so an over-long name is a 400 and not a 22001. */
const CUSTOMER_NAME_MAX = 255;

/**
 * Normalises a customer name to what the column should hold.
 *
 * "No customer" has exactly one representation — NULL — so a name that is
 * absent, null, empty or nothing but spaces all collapse to the same thing.
 * Otherwise a sale saved with a stray space reads as named everywhere it is
 * rendered with `{name && ...}` while displaying nothing.
 *
 * Note this does *not* distinguish absent from cleared; callers that need to
 * tell "leave it alone" from "wipe it" check for the key themselves before
 * calling. See updateOpenSale.
 */
export const normalizeCustomerName = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw badRequest("Customer name must be text");
  }
  const trimmed = value.trim();
  if (trimmed.length > CUSTOMER_NAME_MAX) {
    throw badRequest(
      `Customer name is too long — ${CUSTOMER_NAME_MAX} characters at most`
    );
  }
  return trimmed || null;
};

/**
 * Turns a thrown error into an { status, message } pair for the response.
 *
 * Postgres 23514 is check_violation — with the inventory_stock_non_negative
 * constraint in place, that means a concurrent sale consumed the stock between
 * our availability check and the transaction, so it's the client's problem
 * (400), not a server fault.
 */
export const toErrorResponse = (error) => {
  if (error?.status === 400) {
    return { status: 400, message: error.message };
  }
  if (error?.code === "23514") {
    return {
      status: 400,
      message: "Not enough stock — inventory changed while you were editing. Please reload and try again.",
    };
  }
  if (error?.code === "23505") {
    return { status: 409, message: "That invoice number is already taken." };
  }
  return { status: 500, message: "Internal Server Error" };
};

/**
 * Checks the requested deltas against current stock so we can return a helpful
 * message naming the offending item. This is best-effort only — the
 * inventory_stock_non_negative constraint is the real guarantee, since another
 * request can always slip in between this read and the transaction.
 *
 * NOTE: inventory is joined by `item_name` string; there is no foreign key from
 * the JSONB sale items to the inventory table. Renaming an item while it sits
 * on an open sale will orphan that line. Out of scope here.
 *
 * @param {Map<string, number>} deltas
 * @param {Array<{item_name: string, stock: number}>} rows current inventory
 */
export const assertStockAvailable = (deltas, rows) => {
  const stockByName = new Map(rows.map((r) => [r.item_name, Number(r.stock)]));

  for (const [name, delta] of deltas) {
    if (!stockByName.has(name)) {
      throw badRequest(`Item ${name} not found in inventory`);
    }
    if (stockByName.get(name) + delta < 0) {
      throw badRequest(`Not enough stock for ${name}`);
    }
  }
};
