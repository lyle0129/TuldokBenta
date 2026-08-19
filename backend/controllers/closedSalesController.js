import { sql } from "../config/db.js";
import { normalizeCustomerName, toErrorResponse } from "../utils/saleItems.js";

/** Absent, blank or whitespace-only means "no bound". A bare "" fails the cast. */
const bound = (value) => {
  const trimmed = typeof value === "string" ? value.trim() : value;
  return trimmed ? trimmed : null;
};

export const getClosedSales = async (req, res) => {
  try {
    const { lowdate, highdate, paidlow, paidhigh, createdlow, createdhigh } =
      req.query;

    // Each date gets its own optional bounds, because the two questions the
    // report asks do not share a window: "what was collected" is a paid_at
    // range, while "what was owed on day D" needs everything created on or
    // before D that was still unpaid then — created_at and paid_at bounded
    // independently, which a single BETWEEN on one column cannot express.
    //
    // lowdate/highdate is the original paid_at pair, kept because the Closed
    // Sales day view still sends it.
    const paidLow = bound(paidlow) ?? bound(lowdate);
    const paidHigh = bound(paidhigh) ?? bound(highdate);
    const createdLow = bound(createdlow);
    const createdHigh = bound(createdhigh);

    // One flat template rather than composed fragments: a NULL bound drops its
    // own condition, so every combination is handled without building SQL, and
    // the column names can never come from the query string.
    const sales = await sql`
      SELECT * FROM closed_sales
      WHERE (${paidLow}::timestamp     IS NULL OR paid_at    >= ${paidLow}::timestamp)
        AND (${paidHigh}::timestamp    IS NULL OR paid_at    <= ${paidHigh}::timestamp)
        AND (${createdLow}::timestamp  IS NULL OR created_at >= ${createdLow}::timestamp)
        AND (${createdHigh}::timestamp IS NULL OR created_at <= ${createdHigh}::timestamp)
      ORDER BY paid_at DESC
    `;
    res.status(200).json(sales);
  } catch (error) {
    console.error("Error fetching closed sales", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * PUT /api/closed-sales/:id — set or clear the customer name, nothing else.
 *
 * Deliberately not a general edit. A closed sale has already moved stock, and
 * every path that changes sale lines does so inside the transaction that moves
 * that stock with them (see openSalesController.applyStockAndSale); there is no
 * such transaction here to ride on. Naming a sale is the one edit that changes
 * nothing financial, which is exactly why it can be allowed after payment —
 * anything else still has to go through Revert.
 */
export const updateClosedSale = async (req, res) => {
  try {
    const { id } = req.params;
    const customerName = normalizeCustomerName(req.body?.customer_name);

    const updated = await sql`
      UPDATE closed_sales
      SET customer_name = ${customerName}
      WHERE id = ${id}
      RETURNING *
    `;
    if (updated.length === 0)
      return res.status(404).json({ message: "Sale not found" });
    res.status(200).json(updated[0]);
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    if (status === 500) console.error("Error updating closed sale", error);
    res.status(status).json({ message });
  }
};

export const deleteClosedSale = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted =
      await sql`DELETE FROM closed_sales WHERE id = ${id} RETURNING *`;
    if (deleted.length === 0)
      return res.status(404).json({ message: "Sale not found" });
    res.status(200).json({ message: "Closed sale deleted successfully" });
  } catch (error) {
    console.error("Error deleting closed sale", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
