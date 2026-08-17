import { sql } from "../config/db.js";
import {
  stockDeltas,
  validateItems,
  assertStockAvailable,
  toErrorResponse,
  badRequest,
} from "../utils/saleItems.js";

/**
 * Applies a set of stock changes and a sale mutation as one atomic batch.
 *
 * Every `sql` tagged template in neon-http mode is its own auto-committed round
 * trip, so a multi-step stock change that fails halfway used to leave inventory
 * permanently wrong. `sql.transaction([...])` sends the whole batch as a single
 * transaction — note the queries are passed unawaited on purpose.
 *
 * @param {Map<string, number>} deltas item_name to signed stock change
 * @param {Array} saleQueries unawaited sale-table queries to run in the same tx
 */
const applyStockAndSale = async (deltas, saleQueries) => {
  const stockQueries = [...deltas].map(
    ([name, delta]) => sql`
      UPDATE inventory
      SET stock = stock + ${delta}
      WHERE item_name = ${name}
    `
  );
  return sql.transaction([...stockQueries, ...saleQueries]);
};

/** Current stock for exactly the items a request touches — one query, not N. */
const loadStockFor = async (deltas) => {
  if (deltas.size === 0) return [];
  return sql`
    SELECT item_name, stock FROM inventory
    WHERE item_name = ANY(${[...deltas.keys()]})
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
    const sales = await sql`SELECT * FROM open_sales WHERE 1=1 ${dateFilter} ORDER BY created_at DESC`;
    res.status(200).json(sales);
  } catch (error) {
    console.error("Error fetching open sales", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// POST /api/open-sales
export const createOpenSale = async (req, res) => {
  try {
    const { invoice_number, items } = req.body;
    if (!invoice_number) {
      return res.status(400).json({ message: "Invoice number is required" });
    }
    validateItems(items);
    if (items.length === 0) {
      throw badRequest("A sale must have at least one item");
    }

    const deltas = stockDeltas([], items);
    assertStockAvailable(deltas, await loadStockFor(deltas));

    // Deduction and INSERT go together: a duplicate invoice_number used to make
    // the INSERT fail *after* stock had already been taken, destroying it.
    const results = await applyStockAndSale(deltas, [
      sql`
        INSERT INTO open_sales (invoice_number, items)
        VALUES (${invoice_number}, ${JSON.stringify(items)})
        RETURNING *
      `,
    ]);

    res.status(201).json(results[results.length - 1][0]);
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

    const existingSale = await sql`SELECT * FROM open_sales WHERE id = ${id}`;
    if (existingSale.length === 0) {
      return res.status(404).json({ message: "Sale not found" });
    }

    // Net delta, not restock-everything-then-deduct-everything. The old
    // approach committed the restock before validating the new lines, so a
    // rejected edit left inventory credited for a sale that never changed.
    const deltas = stockDeltas(existingSale[0].items, items);
    assertStockAvailable(deltas, await loadStockFor(deltas));

    const results = await applyStockAndSale(deltas, [
      sql`
        UPDATE open_sales
        SET items = ${JSON.stringify(items)}
        WHERE id = ${id}
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
    const sale = await sql`SELECT * FROM open_sales WHERE id = ${id}`;
    if (sale.length === 0) return res.status(404).json({ message: "Sale not found" });

    // Restock and delete together, so a failed DELETE can't leave the stock
    // credited on a sale that still exists (and gets credited again on retry).
    const deltas = stockDeltas(sale[0].items, []);
    const results = await applyStockAndSale(deltas, [
      sql`DELETE FROM open_sales WHERE id = ${id} RETURNING *`,
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

    const sale = await sql`SELECT * FROM open_sales WHERE id = ${id}`;
    if (sale.length === 0) return res.status(404).json({ message: "Sale not found" });
    const s = sale[0];

    // Stock was already deducted when the sale was created, so nothing to
    // adjust here — but the move must be atomic or the sale can end up in both
    // tables and be paid twice.
    await sql.transaction([
      sql`
        INSERT INTO closed_sales (invoice_number, items, created_at, paid_at, paid_using)
        VALUES (${s.invoice_number}, ${JSON.stringify(s.items)}, ${s.created_at}, ${paidAt}, ${paid_using})
      `,
      sql`DELETE FROM open_sales WHERE id = ${id}`,
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

    const sale = await sql`SELECT * FROM closed_sales WHERE id = ${id}`;
    if (sale.length === 0) return res.status(404).json({ message: "Sale not found" });
    const s = sale[0];

    await sql.transaction([
      sql`
        INSERT INTO open_sales (invoice_number, items, created_at, paid_at, paid_using)
        VALUES (${s.invoice_number}, ${JSON.stringify(s.items)}, ${s.created_at}, ${null}, ${null})
      `,
      sql`DELETE FROM closed_sales WHERE id = ${id}`,
    ]);

    res.status(200).json({ message: "Sale reverted to open." });
  } catch (error) {
    fail(res, error, "Error reverting sale to open");
  }
};
