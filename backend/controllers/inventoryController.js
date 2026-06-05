import { sql } from "../config/db.js";

// GET /api/inventory
export const getInventory = async (req, res) => {
  try {
    const items = await sql`SELECT * FROM inventory ORDER BY item_name ASC`;
    res.status(200).json(items);
  } catch (error) {
    console.error("Error fetching inventory", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// POST /api/inventory (create or restock)
export const createOrRestockItem = async (req, res) => {
  try {
    const { item_name, price, stock, item_classification } = req.body;
    if (!item_name || price === undefined) {
      return res.status(400).json({ message: "Item name and price are required" });
    }

    const existing = await sql`SELECT * FROM inventory WHERE item_name = ${item_name}`;
    if (existing.length > 0) {
      const updated = await sql`
        UPDATE inventory
        SET stock = stock + ${stock || 0}, 
            price = ${price},
            item_classification = COALESCE(${item_classification}, item_classification)
        WHERE item_name = ${item_name}
        RETURNING *
      `;
      return res.status(200).json(updated[0]);
    } else {
      const item = await sql`
        INSERT INTO inventory (item_name, price, stock, item_classification)
        VALUES (${item_name}, ${price}, ${stock || 0}, ${item_classification})
        RETURNING *
      `;
      return res.status(201).json(item[0]);
    }
  } catch (error) {
    console.error("Error adding inventory item", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// PUT /api/inventory/:id
export const updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { item_name, price, stock, item_classification } = req.body;
    const updated = await sql`
      UPDATE inventory
      SET item_name = COALESCE(${item_name}, item_name),
          price = COALESCE(${price}, price),
          stock = COALESCE(${stock}, stock),
          item_classification = COALESCE(${item_classification}, item_classification)
      WHERE id = ${id}
      RETURNING *
    `;
    if (updated.length === 0) return res.status(404).json({ message: "Item not found" });
    res.status(200).json(updated[0]);
  } catch (error) {
    console.error("Error updating inventory item", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// DELETE /api/inventory/:id
export const deleteItem = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await sql`DELETE FROM inventory WHERE id = ${id} RETURNING *`;
    if (deleted.length === 0) return res.status(404).json({ message: "Item not found" });
    res.status(200).json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Error deleting inventory item", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
