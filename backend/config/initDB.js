import { sql } from "../config/db.js";

export async function initDB() {
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
        item_classification VARCHAR(100), -- ✅ NEW COLUMN
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        service_name VARCHAR(255) UNIQUE NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        freebies JSONB DEFAULT '[]', -- ✅ NEW COLUMN
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Guarantees stock can never go negative, even if two requests race between
    // the availability check and the UPDATE. This is what makes the batched
    // transactions in openSalesController safe — an oversell rolls the whole
    // batch back instead of silently corrupting inventory.
    // NOT VALID: enforced on every new write, but existing rows are not
    // re-checked, so this cannot fail on stock that is already negative.
    await sql`
      DO $$ BEGIN
        ALTER TABLE inventory
          ADD CONSTRAINT inventory_stock_non_negative CHECK (stock >= 0) NOT VALID;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `;

    // The order items appear in on the Inventory page and in the sale catalog.
    // Before this, the only ordering was `item_name ASC`, which is why item
    // names carry "[Detergent] " / "[Fabcon] " prefixes — the name was being
    // bent to force the alphabetical sort into groups.
    await sql`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS sort_order INT`;

    // One-time backfill: number existing rows in the order they already
    // appeared in. Only touches NULLs, so every boot after the first is a
    // no-op and a deliberate reorder is never undone.
    await sql`
      UPDATE inventory SET sort_order = t.rn
      FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY item_name ASC) AS rn FROM inventory
      ) t
      WHERE inventory.id = t.id AND inventory.sort_order IS NULL
    `;

    // Same treatment for services: the sale catalog renders them before items,
    // so their order is the first thing a cashier reads.
    await sql`ALTER TABLE services ADD COLUMN IF NOT EXISTS sort_order INT`;

    await sql`
      UPDATE services SET sort_order = t.rn
      FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY service_name ASC) AS rn FROM services
      ) t
      WHERE services.id = t.id AND services.sort_order IS NULL
    `;

    console.log("✅ Database initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing DB", error);
    process.exit(1);
  }
}
