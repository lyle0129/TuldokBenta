import { sql } from "../config/db.js";
import { toErrorResponse } from "../utils/saleItems.js";
import { invalidOrderedIds } from "../utils/reorder.js";

/**
 * `undefined`/`null` means "leave it alone" (the COALESCE cases below).
 * Anything else has to be a whole number of at least 0 — stock is INT and is
 * guarded by a CHECK (stock >= 0) constraint, so a bad value would otherwise
 * surface as an opaque 500.
 */
const invalidStock = (stock) =>
  stock !== undefined && stock !== null && (!Number.isInteger(Number(stock)) || Number(stock) < 0);

/**
 * Same "undefined means leave it alone" contract as invalidStock.
 *
 * Price was never validated, so a typo of "-15" or "abc" in the admin form was
 * accepted — the latter landing as NaN and blowing up as a 500 inside Postgres.
 */
const invalidPrice = (price) =>
  price !== undefined && price !== null && (!Number.isFinite(Number(price)) || Number(price) < 0);

/** Ordering used everywhere: the admin's custom order, then name for un-numbered rows. */
const selectOrdered = (shopId) =>
  sql`SELECT * FROM inventory WHERE shop_id = ${shopId} ORDER BY sort_order NULLS LAST, item_name ASC`;

const fail = (res, error, context) => {
  const { status, message } = toErrorResponse(error);
  if (status === 500) console.error(context, error);
  return res.status(status).json({ message });
};

// GET /api/inventory
export const getInventory = async (req, res) => {
  try {
    const items = await selectOrdered(req.shopId);
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
    if (invalidStock(stock)) {
      return res.status(400).json({ message: "Stock must be a whole number of 0 or more" });
    }
    if (invalidPrice(price)) {
      return res.status(400).json({ message: "Price must be a number of 0 or more" });
    }

    const existing =
      await sql`SELECT * FROM inventory WHERE shop_id = ${req.shopId} AND item_name = ${item_name}`;
    if (existing.length > 0) {
      const updated = await sql`
        UPDATE inventory
        SET stock = stock + ${stock || 0},
            price = ${price},
            item_classification = COALESCE(${item_classification}, item_classification)
        WHERE shop_id = ${req.shopId} AND item_name = ${item_name}
        RETURNING *
      `;
      return res.status(200).json(updated[0]);
    } else {
      // New items land at the bottom of the custom order rather than at a NULL
      // sort_order, which would float them to the end unpredictably.
      //
      // The subquery is scoped too, or a new shop's first item inherits another
      // shop's ordering and starts at MAX(everyone) + 1 instead of 1.
      const item = await sql`
        INSERT INTO inventory (shop_id, item_name, price, stock, item_classification, sort_order)
        VALUES (
          ${req.shopId}, ${item_name}, ${price}, ${stock || 0}, ${item_classification},
          (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM inventory WHERE shop_id = ${req.shopId})
        )
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
    if (invalidStock(stock)) {
      return res.status(400).json({ message: "Stock must be a whole number of 0 or more" });
    }
    if (invalidPrice(price)) {
      return res.status(400).json({ message: "Price must be a number of 0 or more" });
    }
    // `stock` here is an absolute set, not a delta — this is the admin
    // correction path, so whatever the admin typed wins. Routine restocking
    // goes through restockItem below, which increments instead; sending an
    // absolute value here will clobber any sale that deducted stock in the
    // meantime.
    //
    // KNOWN LIMITATION: renaming `item_name` orphans any open sale holding the
    // old name, because sale items reference inventory by name string with no
    // foreign key. Restocking such a sale will match zero rows.
    const updated = await sql`
      UPDATE inventory
      SET item_name = COALESCE(${item_name}, item_name),
          price = COALESCE(${price}, price),
          stock = COALESCE(${stock}, stock),
          item_classification = COALESCE(${item_classification}, item_classification)
      WHERE id = ${id} AND shop_id = ${req.shopId}
      RETURNING *
    `;
    if (updated.length === 0) return res.status(404).json({ message: "Item not found" });
    res.status(200).json(updated[0]);
  } catch (error) {
    console.error("Error updating inventory item", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// POST /api/inventory/:id/restock
/**
 * Adds stock to one item. This is the routine "a delivery arrived" path.
 *
 * The increment is done in SQL (`stock = stock + amount`), never as a
 * read-modify-write, so it cannot lose a deduction made by a sale that
 * completed while the admin had the form open — which is exactly what the
 * absolute `stock` field on updateItem does.
 *
 * Add-only on purpose: taking stock away is a correction, and corrections go
 * through updateItem where the admin sees the resulting absolute number.
 */
export const restockItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;

    if (!Number.isInteger(Number(amount)) || Number(amount) < 1) {
      return res.status(400).json({ message: "Amount must be a whole number of at least 1" });
    }

    const updated = await sql`
      UPDATE inventory
      SET stock = stock + ${Number(amount)}
      WHERE id = ${id} AND shop_id = ${req.shopId}
      RETURNING *
    `;
    if (updated.length === 0) return res.status(404).json({ message: "Item not found" });
    res.status(200).json(updated[0]);
  } catch (error) {
    fail(res, error, "Error restocking inventory item");
  }
};

// POST /api/inventory/reorder
/**
 * Renumbers `sort_order` to match the given list of ids, 1..N.
 *
 * Takes the whole list rather than a single swap, which makes it self-healing:
 * every call rewrites the numbering from scratch, so NULL or duplicate
 * sort_order values left by an interrupted write get cleaned up.
 *
 * All the UPDATEs go in one `sql.transaction`, since each neon-http tagged
 * template is otherwise its own auto-committed round trip and a failure halfway
 * would leave the catalog in an order nobody asked for.
 */
export const reorderInventory = async (req, res) => {
  try {
    const { orderedIds } = req.body;

    const problem = invalidOrderedIds(orderedIds);
    if (problem) return res.status(400).json({ message: problem });

    // Queries are passed unawaited on purpose — sql.transaction batches them.
    //
    // Every one of them is scoped: the ids come straight from the client, so
    // without the predicate a caller could renumber — and thereby confirm the
    // existence of — rows in another shop.
    await sql.transaction(
      orderedIds.map(
        (id, index) => sql`
          UPDATE inventory
          SET sort_order = ${index + 1}
          WHERE id = ${Number(id)} AND shop_id = ${req.shopId}
        `
      )
    );

    // Return the resulting list so the client can reconcile its optimistic order.
    const items = await selectOrdered(req.shopId);
    res.status(200).json(items);
  } catch (error) {
    fail(res, error, "Error reordering inventory");
  }
};

// DELETE /api/inventory/:id
export const deleteItem = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted =
      await sql`DELETE FROM inventory WHERE id = ${id} AND shop_id = ${req.shopId} RETURNING *`;
    if (deleted.length === 0) return res.status(404).json({ message: "Item not found" });
    res.status(200).json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Error deleting inventory item", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
