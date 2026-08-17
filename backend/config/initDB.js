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

    console.log("✅ Database initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing DB", error);
    process.exit(1);
  }
}
