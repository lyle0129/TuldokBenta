import { sql } from "../config/db.js";
import {
  normalizeCustomerName,
  toErrorResponse,
  badRequest,
} from "../utils/saleItems.js";
import { assertMethodActive } from "../utils/paymentMethods.js";

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
 * PUT /api/closed-sales/:id — the customer name and the payment method.
 *
 * Deliberately not a general edit. The rule is that an edit is safe after
 * payment only if it moves no stock: every path that changes sale *lines* does
 * so inside the transaction that moves stock with them (see
 * openSalesController.applyStockAndSale), and there is no such transaction here
 * to ride on. Who the sale was for and which tender settled it both pass that
 * test; anything touching the lines still has to go through Revert.
 *
 * `paid_at` is pointedly not editable and pointedly not touched. Correcting the
 * method used to mean Revert then re-Pay, which stamps a new paid_at and moves
 * the sale in every report keyed off the payment date — which is the whole
 * reason this endpoint grew the field.
 */
export const updateClosedSale = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await sql`SELECT * FROM closed_sales WHERE id = ${id}`;
    if (existing.length === 0)
      return res.status(404).json({ message: "Sale not found" });
    const sale = existing[0];

    // Presence, not COALESCE — the idiom updateOpenSale documents. An absent
    // key means "leave it alone", a present one means "set it, even to empty",
    // so a caller that only knows about names can't blank out a method and the
    // method dialog can't wipe a name.
    const customerName = Object.hasOwn(req.body ?? {}, "customer_name")
      ? normalizeCustomerName(req.body.customer_name)
      : sale.customer_name;

    let paidUsing = sale.paid_using;
    if (Object.hasOwn(req.body ?? {}, "paid_using")) {
      paidUsing = typeof req.body.paid_using === "string"
        ? req.body.paid_using.trim()
        : req.body.paid_using;

      // A closed sale always settled somehow; there is no "no method" state to
      // clear it back to.
      if (!paidUsing) throw badRequest("Payment method is required");

      // Only validated when it actually changes. A sale paid with a method that
      // has since been deactivated must still be nameable — and re-savable with
      // the method it really used — without being forced onto a current one.
      if (paidUsing !== sale.paid_using) {
        assertMethodActive(
          await sql`
            SELECT code FROM payment_methods
            WHERE code = ${paidUsing} AND is_active = TRUE
          `
        );
      }
    }

    const updated = await sql`
      UPDATE closed_sales
      SET customer_name = ${customerName},
          paid_using = ${paidUsing}
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
