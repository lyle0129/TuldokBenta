import { sql } from "../config/db.js";

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
