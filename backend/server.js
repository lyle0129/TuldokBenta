import express from "express";
import dotenv from "dotenv";
import { sql } from "./config/db.js";
import cors from "cors";

dotenv.config();
const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:5173", // local dev
      "https://your-frontend.vercel.app", // replace with your frontend
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());
const PORT = process.env.PORT || 5001;

// ===============================
// ✅ DB Init
// ===============================
async function initDB() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS open_sales (
        id SERIAL PRIMARY KEY,
        invoice_number VARCHAR(255) UNIQUE NOT NULL,
        items JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        paid_at TIMESTAMP NULL,
        paid_using VARCHAR(50) NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS closed_sales (
        id SERIAL PRIMARY KEY,
        invoice_number VARCHAR(255) UNIQUE NOT NULL,
        items JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL,
        paid_at TIMESTAMP NOT NULL,
        paid_using VARCHAR(50) NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        item_name VARCHAR(255) UNIQUE NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        stock INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        service_name VARCHAR(255) UNIQUE NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    console.log("✅ Database initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing DB", error);
    process.exit(1);
  }
}

// ===============================
// Health Check -- working
// ===============================
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// ===============================
// 📌 SERVICES CRUD 
// ===============================
app.get("/api/services", async (req, res) => {
  try {
    const services = await sql`SELECT * FROM services ORDER BY service_name ASC`;
    res.status(200).json(services);
  } catch (error) {
    console.error("Error fetching services", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/api/services", async (req, res) => {
  try {
    const { service_name, price } = req.body;
    if (!service_name || price === undefined) {
      return res.status(400).json({ message: "Service name and price are required" });
    }
    const service = await sql`
      INSERT INTO services (service_name, price)
      VALUES (${service_name}, ${price})
      RETURNING *
    `;
    res.status(201).json(service[0]);
  } catch (error) {
    console.error("Error adding service", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put("/api/services/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { service_name, price } = req.body;
    const updated = await sql`
      UPDATE services
      SET service_name = COALESCE(${service_name}, service_name),
          price = COALESCE(${price}, price)
      WHERE id = ${id}
      RETURNING *
    `;
    if (updated.length === 0) return res.status(404).json({ message: "Service not found" });
    res.status(200).json(updated[0]);
  } catch (error) {
    console.error("Error updating service", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/api/services/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await sql`DELETE FROM services WHERE id = ${id} RETURNING *`;
    if (deleted.length === 0) return res.status(404).json({ message: "Service not found" });
    res.status(200).json({ message: "Service deleted successfully" });
  } catch (error) {
    console.error("Error deleting service", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ===============================
// 📌 INVENTORY CRUD
// ===============================
app.get("/api/inventory", async (req, res) => {
  try {
    const items = await sql`SELECT * FROM inventory ORDER BY item_name ASC`;
    res.status(200).json(items);
  } catch (error) {
    console.error("Error fetching inventory", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/api/inventory", async (req, res) => {
  try {
    const { item_name, price, stock } = req.body;
    if (!item_name || price === undefined) {
      return res.status(400).json({ message: "Item name and price are required" });
    }
    const item = await sql`
      INSERT INTO inventory (item_name, price, stock)
      VALUES (${item_name}, ${price}, ${stock || 0})
      RETURNING *
    `;
    res.status(201).json(item[0]);
  } catch (error) {
    console.error("Error adding inventory item", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put("/api/inventory/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { item_name, price, stock } = req.body;
    const updated = await sql`
      UPDATE inventory
      SET item_name = COALESCE(${item_name}, item_name),
          price = COALESCE(${price}, price),
          stock = COALESCE(${stock}, stock)
      WHERE id = ${id}
      RETURNING *
    `;
    if (updated.length === 0) return res.status(404).json({ message: "Item not found" });
    res.status(200).json(updated[0]);
  } catch (error) {
    console.error("Error updating inventory item", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/api/inventory/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await sql`DELETE FROM inventory WHERE id = ${id} RETURNING *`;
    if (deleted.length === 0) return res.status(404).json({ message: "Item not found" });
    res.status(200).json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Error deleting inventory item", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ===============================
// 📌 OPEN SALES CRUD
// ===============================
app.get("/api/open-sales", async (req, res) => {
  try {
    const sales = await sql`SELECT * FROM open_sales ORDER BY created_at DESC`;
    res.status(200).json(sales);
  } catch (error) {
    console.error("Error fetching open sales", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/api/open-sales", async (req, res) => {
  try {
    const { invoice_number, items } = req.body;
    if (!invoice_number || !items) {
      return res.status(400).json({ message: "Invoice number and items are required" });
    }

    // ✅ Deduct stock immediately for items
    for (const item of items) {
      if (item.type === "item") {
        await sql`
          UPDATE inventory
          SET stock = stock - ${item.quantity}
          WHERE id = ${item.refId}
        `;
      }
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
});

app.put("/api/open-sales/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

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
});

app.delete("/api/open-sales/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const deleted = await sql`DELETE FROM open_sales WHERE id = ${id} RETURNING *`;
    if (deleted.length === 0) return res.status(404).json({ message: "Sale not found" });
    res.status(200).json({ message: "Sale deleted successfully" });
  } catch (error) {
    console.error("Error deleting open sale", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ===============================
// 📌 MOVE SALE TO CLOSED
// ===============================
app.post("/api/pay-sale/:id", async (req, res) => {
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
});

// ===============================
// 📌 REVERT SALE TO OPEN
// ===============================
app.post("/api/revert-sale/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const paid_using = null
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
});

// ===============================
// 📌 CLOSED SALES CRUD
// ===============================
app.get("/api/closed-sales", async (req, res) => {
  try {
    const sales =
      await sql`SELECT * FROM closed_sales ORDER BY paid_at DESC`;
    res.status(200).json(sales);
  } catch (error) {
    console.error("Error fetching closed sales", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/api/closed-sales/:id", async (req, res) => {
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
});

// ===============================
// START SERVER
// ===============================
initDB().then(() => {
  app.listen(PORT, () => {
    console.log("🚀 Server running on port:", PORT);
  });
});
