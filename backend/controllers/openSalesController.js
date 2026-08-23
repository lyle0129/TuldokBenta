import { sql } from "../config/db.js";
import {
  stockDeltas,
  validateItems,
  assertStockAvailable,
  toErrorResponse,
  badRequest,
  normalizeCustomerName,
} from "../utils/saleItems.js";
import { assertMethodActive } from "../utils/paymentMethods.js";
import {
  allocateInvoice,
  parseInvoiceSeq,
  isInvoiceTaken,
} from "../utils/invoiceNumber.js";

/** How many times to re-pick a number when a concurrent create beats us to it. */
const INVOICE_ATTEMPTS = 5;

/**
 * Applies a set of stock changes and a sale mutation as one atomic batch.
 *
 * Every `sql` tagged template in neon-http mode is its own auto-committed round
 * trip, so a multi-step stock change that fails halfway used to leave inventory
 * permanently wrong. `sql.transaction([...])` sends the whole batch as a single
 * transaction — note the queries are passed unawaited on purpose.
 *
 * The shop is passed in rather than read from a request this has no access to —
 * and the predicate below is the single most important one in this file. Sale
 * lines reference inventory by name string with no foreign key, so without
 * `shop_id` a sale at one shop silently decrements another shop's stock for
 * every item name the two share, which for a chain of laundromats is all of them.
 *
 * @param {number} shopId the trusted scope, from req.shopId
 * @param {Map<string, number>} deltas item_name to signed stock change
 * @param {Array} saleQueries unawaited sale-table queries to run in the same tx
 */
const applyStockAndSale = async (shopId, deltas, saleQueries) => {
  const stockQueries = [...deltas].map(
    ([name, delta]) => sql`
      UPDATE inventory
      SET stock = stock + ${delta}
      WHERE shop_id = ${shopId} AND item_name = ${name}
    `
  );
  return sql.transaction([...stockQueries, ...saleQueries]);
};

/** Current stock for exactly the items a request touches — one query, not N. */
const loadStockFor = async (shopId, deltas) => {
  if (deltas.size === 0) return [];
  return sql`
    SELECT item_name, stock FROM inventory
    WHERE shop_id = ${shopId} AND item_name = ANY(${[...deltas.keys()]})
  `;
};

const fail = (res, error, context) => {
  const { status, message } = toErrorResponse(error);
  if (status === 500) console.error(context, error);
  return res.status(status).json({ message });
};

// GET /api/open-sales
export const getOpenSales = async (req, res) => {
  try {
    const { lowdate, highdate } = req.query;
    // Open sales are unpaid by definition (paySale moves the row to
    // closed_sales), so filter on created_at — filtering on paid_at always
    // matched zero rows.
    const dateFilter =
      lowdate && highdate
        ? sql` AND created_at BETWEEN ${lowdate} AND ${highdate} `
        : sql``;
    // The old `WHERE 1=1` placeholder existed only so the optional fragment above
    // could always start with AND. The shop predicate now fills that role.
    const sales = await sql`SELECT * FROM open_sales WHERE shop_id = ${req.shopId} ${dateFilter} ORDER BY created_at DESC`;
    res.status(200).json(sales);
  } catch (error) {
    console.error("Error fetching open sales", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * GET /api/next-invoice
 *
 * A preview of the number the next sale will most likely get, so the cart can show
 * the cashier where the numbering stands. Deliberately not a reservation: two cashiers
 * asking at once get the same answer, and whoever checks out second is allocated the
 * one after it. The alternative was the client's old approach — download every closed
 * sale and take the maximum — which cost the whole table for one integer and was no
 * more accurate.
 */
export const getNextInvoice = async (req, res) => {
  try {
    const { invoice } = await allocateInvoice(sql, req.shopId);
    res.status(200).json({ invoice_number: invoice });
  } catch (error) {
    console.error("Error reading the next invoice number", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * POST /api/open-sales
 *
 * The invoice number is allocated here, not supplied by the caller. Sending one is
 * optional and means "use this if it's free" — which is what the offline queue does,
 * since a sale saved there already has a number on a printed receipt. A number that
 * is taken is replaced rather than refused: the offline page's only job is to get a
 * stranded sale onto the server, and a 409 used to strand it until someone retyped
 * the number by hand. `invoice_reassigned` tells the caller that happened so it can
 * ask for a reprint.
 */
export const createOpenSale = async (req, res) => {
  try {
    const { items } = req.body;
    const requested =
      typeof req.body.invoice_number === "string"
        ? req.body.invoice_number.trim()
        : "";

    const customerName = normalizeCustomerName(req.body.customer_name);
    validateItems(items);
    if (items.length === 0) {
      throw badRequest("A sale must have at least one item");
    }

    const deltas = stockDeltas([], items);
    assertStockAvailable(deltas, await loadStockFor(req.shopId, deltas));

    // Allocated up front even when the caller supplied a number, because the shop's
    // prefix comes back with it and a supplied number can only be turned into an
    // invoice_seq by parsing it against that prefix.
    let allocated = await allocateInvoice(sql, req.shopId);

    // A supplied number that is free *within this shop* is honoured. It may not
    // parse as this shop's series at all — the offline page lets it be typed by
    // hand — in which case invoice_seq stays NULL rather than the sale being
    // refused. invoice_number remains the authoritative display value either way.
    let invoice = null;
    let seq = null;
    if (requested && !(await isInvoiceTaken(sql, req.shopId, requested))) {
      invoice = requested;
      seq = parseInvoiceSeq(requested, allocated.prefix);
    }

    for (let attempt = 0; attempt < INVOICE_ATTEMPTS; attempt++) {
      if (!invoice) {
        ({ invoice, seq } = allocated);
      }

      try {
        // Deduction and INSERT go together: a duplicate invoice_number used to make
        // the INSERT fail *after* stock had already been taken, destroying it.
        const results = await applyStockAndSale(req.shopId, deltas, [
          sql`
            INSERT INTO open_sales (shop_id, invoice_number, invoice_seq, items, customer_name)
            VALUES (${req.shopId}, ${invoice}, ${seq}, ${JSON.stringify(items)}, ${customerName})
            RETURNING *
          `,
        ]);

        const created = results[results.length - 1][0];
        return res.status(201).json({
          ...created,
          requested_invoice_number: requested || null,
          invoice_reassigned:
            Boolean(requested) && created.invoice_number !== requested,
        });
      } catch (error) {
        // The checks above are plain reads, so another create can still take the
        // number between them and this INSERT. That's a 23505 — now on the composite
        // (shop_id, invoice_number) constraint — and it rolled the whole transaction
        // back, stock included, so picking the next number and trying again is safe
        // rather than double-deducting.
        if (error?.code !== "23505") throw error;
        invoice = null;
        seq = null;
        // Re-read rather than incrementing: whoever beat us to the number may have
        // taken several, and the shop row is the only thing that knows.
        allocated = await allocateInvoice(sql, req.shopId);
      }
    }

    throw badRequest("Could not allocate an invoice number. Please try again.");
  } catch (error) {
    fail(res, error, "Error creating open sale");
  }
};

// PUT /api/open-sales/:id
export const updateOpenSale = async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;
    validateItems(items);
    if (items.length === 0) {
      throw badRequest("A sale must have at least one item — delete the sale instead");
    }

    // Scoped, so another shop's sale is simply not found. 404 rather than 403 on
    // purpose: a 403 would confirm to the caller that the id exists somewhere.
    const existingSale =
      await sql`SELECT * FROM open_sales WHERE id = ${id} AND shop_id = ${req.shopId}`;
    if (existingSale.length === 0) {
      return res.status(404).json({ message: "Sale not found" });
    }

    // Presence, not COALESCE. The idiom elsewhere in this codebase treats NULL
    // as "leave it alone", which makes clearing a value impossible — fine for
    // an item's classification, wrong for a name a cashier typed by mistake.
    // Omitting the key entirely still means "don't touch it", so a caller that
    // knows nothing about customers can't blank one out.
    const nextCustomerName = Object.hasOwn(req.body, "customer_name")
      ? normalizeCustomerName(req.body.customer_name)
      : existingSale[0].customer_name;

    // Net delta, not restock-everything-then-deduct-everything. The old
    // approach committed the restock before validating the new lines, so a
    // rejected edit left inventory credited for a sale that never changed.
    const deltas = stockDeltas(existingSale[0].items, items);
    assertStockAvailable(deltas, await loadStockFor(req.shopId, deltas));

    const results = await applyStockAndSale(req.shopId, deltas, [
      sql`
        UPDATE open_sales
        SET items = ${JSON.stringify(items)},
            customer_name = ${nextCustomerName}
        WHERE id = ${id} AND shop_id = ${req.shopId}
        RETURNING *
      `,
    ]);

    const updated = results[results.length - 1];
    if (updated.length === 0) return res.status(404).json({ message: "Sale not found" });
    res.status(200).json(updated[0]);
  } catch (error) {
    fail(res, error, "Error updating open sale");
  }
};

// DELETE /api/open-sales/:id
export const deleteOpenSale = async (req, res) => {
  try {
    const { id } = req.params;
    const sale =
      await sql`SELECT * FROM open_sales WHERE id = ${id} AND shop_id = ${req.shopId}`;
    if (sale.length === 0) return res.status(404).json({ message: "Sale not found" });

    // Restock and delete together, so a failed DELETE can't leave the stock
    // credited on a sale that still exists (and gets credited again on retry).
    const deltas = stockDeltas(sale[0].items, []);
    const results = await applyStockAndSale(req.shopId, deltas, [
      sql`DELETE FROM open_sales WHERE id = ${id} AND shop_id = ${req.shopId} RETURNING *`,
    ]);

    if (results[results.length - 1].length === 0) {
      return res.status(404).json({ message: "Sale not found" });
    }
    res.status(200).json({ message: "Sale deleted successfully" });
  } catch (error) {
    fail(res, error, "Error deleting open sale");
  }
};

// POST /api/pay-sale/:id
export const paySale = async (req, res) => {
  try {
    const { id } = req.params;
    const { paid_using } = req.body;
    const paidAt = new Date();
    if (!paid_using) {
      return res.status(400).json({ message: "Payment method is required" });
    }

    // The method list is cached on the client for five minutes, so a cashier can
    // still be offering one that was just deactivated. paid_using is stored as a
    // plain string either way — this only rejects codes with no active row.
    // Shared with updateClosedSale so the two paths can't drift.
    assertMethodActive(
      await sql`
        SELECT code FROM payment_methods
        WHERE shop_id = ${req.shopId} AND code = ${paid_using} AND is_active = TRUE
      `
    );

    const sale =
      await sql`SELECT * FROM open_sales WHERE id = ${id} AND shop_id = ${req.shopId}`;
    if (sale.length === 0) return res.status(404).json({ message: "Sale not found" });
    const s = sale[0];

    // Stock was already deducted when the sale was created, so nothing to
    // adjust here — but the move must be atomic or the sale can end up in both
    // tables and be paid twice.
    //
    // shop_id and invoice_seq are carried from the originating row rather than
    // re-derived: this is the one operation that copies a sale between tables,
    // and re-deriving either would be a chance to lose the tenant or the series.
    await sql.transaction([
      sql`
        INSERT INTO closed_sales (shop_id, invoice_number, invoice_seq, items, created_at, paid_at, paid_using, customer_name)
        VALUES (${s.shop_id}, ${s.invoice_number}, ${s.invoice_seq ?? null}, ${JSON.stringify(s.items)}, ${s.created_at}, ${paidAt}, ${paid_using}, ${s.customer_name ?? null})
      `,
      sql`DELETE FROM open_sales WHERE id = ${id} AND shop_id = ${req.shopId}`,
    ]);

    res.status(200).json({ message: "Sale moved to closed", paid_at: paidAt, paid_using });
  } catch (error) {
    fail(res, error, "Error moving sale to closed");
  }
};

// POST /api/revert-sale/:id
export const revertSale = async (req, res) => {
  try {
    const { id } = req.params;

    const sale =
      await sql`SELECT * FROM closed_sales WHERE id = ${id} AND shop_id = ${req.shopId}`;
    if (sale.length === 0) return res.status(404).json({ message: "Sale not found" });
    const s = sale[0];

    // The mirror image of paySale: same reason for carrying shop_id and
    // invoice_seq across rather than re-deriving them.
    await sql.transaction([
      sql`
        INSERT INTO open_sales (shop_id, invoice_number, invoice_seq, items, created_at, paid_at, paid_using, customer_name)
        VALUES (${s.shop_id}, ${s.invoice_number}, ${s.invoice_seq ?? null}, ${JSON.stringify(s.items)}, ${s.created_at}, ${null}, ${null}, ${s.customer_name ?? null})
      `,
      sql`DELETE FROM closed_sales WHERE id = ${id} AND shop_id = ${req.shopId}`,
    ]);

    res.status(200).json({ message: "Sale reverted to open." });
  } catch (error) {
    fail(res, error, "Error reverting sale to open");
  }
};
