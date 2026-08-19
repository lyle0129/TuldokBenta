import { sql } from "../config/db.js";

export const getClosedSales = async (req, res) => {
  try {
    const { lowdate, highdate, datefield } = req.query;

    // `paid_at` is the default because a closed sale's date *is* the day the
    // money arrived; `created_at` is offered only so the report can also ask
    // "what was written in this range", which no other caller needs.
    //
    // The two branches are literal fragments rather than an interpolated
    // identifier, so the column can never come from the query string.
    const dateFilter = !(lowdate && highdate)
      ? sql``
      : datefield === "created_at"
      ? sql` AND created_at BETWEEN ${lowdate} AND ${highdate} `
      : sql` AND paid_at BETWEEN ${lowdate} AND ${highdate} `;

    const sales =
      await sql`SELECT * FROM closed_sales WHERE 1=1 ${dateFilter} ORDER BY paid_at DESC`;
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
