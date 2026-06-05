import { sql } from "../config/db.js";

// GET /api/open-sales
export const getOpenSales = async (req, res) => {
  try {
    const { lowdate, highdate } = req.query;
    const dateFilter = (lowdate && highdate)
      ? sql` AND paid_at BETWEEN ${lowdate} AND ${highdate} `
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
    if (!invoice_number || !items) {
      return res.status(400).json({ message: "Invoice number and items are required" });
    }
     // ✅ Deduct stock only for inventory items
    for (const item of items) {
      if (item.type === "item") {// i think checking item type is wrong cuz items above doesnt store type
        // Check stock availability
        const existing = await sql`SELECT * FROM inventory WHERE item_name = ${item.item_name}`;
        if (existing.length === 0) {
          return res.status(400).json({ message: `Item ${item.item_name} not found in inventory` });
        }
        if (existing[0].stock < item.qty) {
          return res.status(400).json({ message: `Not enough stock for ${item.item_name}` });
        }
        // Deduct stock
        await sql`
          UPDATE inventory
          SET stock = stock - ${item.qty}
          WHERE item_name = ${item.item_name}
        `;
      }
      // if type === "service", do nothing ✅
    }
    const sale = await sql`
      INSERT INTO open_sales (invoice_number, items)
      VALUES (${invoice_number}, ${JSON.stringify(items)})
      RETURNING *
    `;
    res.status(201).json(sale[0]);
  } catch (error) {
    console.error("Error creating open sale", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// PUT /api/open-sales/:id
// to edit Put and delete yung sa pagchange ng stocks
export const updateOpenSale = async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;
    const existingSale = await sql`SELECT * FROM open_sales WHERE id = ${id}`;
    if (existingSale.length === 0) {
      return res.status(404).json({ message: "Sale not found" });
    }
    const oldItems = existingSale[0].items;
    // ✅ Restock old inventory items
    for (const oldItem of oldItems) {
      if (oldItem.type === "item") {
        await sql`
          UPDATE inventory
          SET stock = stock + ${oldItem.qty}
          WHERE item_name = ${oldItem.item_name}
        `;
      }
    }
    // ✅ Deduct stock for new items
    for (const newItem of items) {
      if (newItem.type === "item") {
        const existing = await sql`SELECT * FROM inventory WHERE item_name = ${newItem.item_name}`;
        if (existing.length === 0) {
          return res.status(400).json({ message: `Item ${newItem.item_name} not found in inventory` });
        }
        if (existing[0].stock < newItem.qty) {
          return res.status(400).json({ message: `Not enough stock for ${newItem.item_name}` });
        }
        await sql`
          UPDATE inventory
          SET stock = stock - ${newItem.qty}
          WHERE item_name = ${newItem.item_name}
        `;
      }
    }
    const updated = await sql`
      UPDATE open_sales
      SET items = ${JSON.stringify(items)}
      WHERE id = ${id}
      RETURNING *
    `;
    if (updated.length === 0) return res.status(404).json({ message: "Sale not found" });
    res.status(200).json(updated[0]);
  } catch (error) {
    console.error("Error updating open sale", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// DELETE /api/open-sales/:id
export const deleteOpenSale = async (req, res) => {
  try {
    const { id } = req.params;
    const sale = await sql`SELECT * FROM open_sales WHERE id = ${id}`;
    if (sale.length === 0) return res.status(404).json({ message: "Sale not found" });
    const items = sale[0].items;
    // ✅ Restock only inventory items
    for (const item of items) {
      if (item.type === "item") {
        await sql`
          UPDATE inventory
          SET stock = stock + ${item.qty}
          WHERE item_name = ${item.item_name}
        `;
      }
    }
    const deleted = await sql`DELETE FROM open_sales WHERE id = ${id} RETURNING *`;
    if (deleted.length === 0) return res.status(404).json({ message: "Sale not found" });
    res.status(200).json({ message: "Sale deleted successfully" });
  } catch (error) {
    console.error("Error deleting open sale", error);
    res.status(500).json({ message: "Internal Server Error" });
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
    // Get sale from open_sales
    const sale = await sql`SELECT * FROM open_sales WHERE id = ${id}`;
    if (sale.length === 0) return res.status(404).json({ message: "Sale not found" });
    const s = sale[0];
    console.log(s);
    // ✅ Insert into closed_sales
    await sql`
      INSERT INTO closed_sales (invoice_number, items, created_at, paid_at, paid_using)
      VALUES (${s.invoice_number}, ${JSON.stringify(s.items)}, ${s.created_at}, ${paidAt}, ${paid_using})
    `;
    // ✅ Remove from open_sales
    await sql`DELETE FROM open_sales WHERE id = ${id}`;
    res.status(200).json({ message: "Sale moved to closed", paid_at: paidAt, paid_using });
  } catch (error) {
    console.error("Error moving sale to closed", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// POST /api/revert-sale/:id
export const revertSale = async (req, res) => {
  try {
    const { id } = req.params;
    const paid_using = null;
    const paidAt = null;
    // Get sale from open_sales
    const sale = await sql`SELECT * FROM closed_sales WHERE id = ${id}`;
    if (sale.length === 0) return res.status(404).json({ message: "Sale not found" });
    const s = sale[0];
    console.log(s);
    // ✅ Insert into closed_sales
    await sql`
      INSERT INTO open_sales (invoice_number, items, created_at, paid_at, paid_using)
      VALUES (${s.invoice_number}, ${JSON.stringify(s.items)}, ${s.created_at}, ${paidAt}, ${paid_using})
    `;
    // ✅ Remove from open_sales
    await sql`DELETE FROM closed_sales WHERE id = ${id}`;
    res.status(200).json({ message: "Sale reverted to open."});
  } catch (error) {
    console.error("Error moving sale to closed", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
