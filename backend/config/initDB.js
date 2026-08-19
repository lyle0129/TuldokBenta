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

    // Who the sale is for. Nullable on purpose and with no backfill — unlike
    // sort_order there is no sensible value to invent for a sale taken before
    // the field existed, and NULL is exactly what "we never asked" means.
    //
    // Deliberately a plain column on both sale tables rather than a customers
    // table: nothing here looks a customer up, counts their visits or joins on
    // them. It is a label written on the invoice, and paid_using above
    // documents what happens when a display string is promoted into a key.
    await sql`ALTER TABLE open_sales ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255)`;
    await sql`ALTER TABLE closed_sales ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255)`;

    // The payment methods the pay dialog offers, so a new one can be added
    // without a code change. Deliberately NOT a foreign key: `paid_using` on the
    // sale tables stays a plain string, exactly as it was written before this
    // table existed, so no historical row has to be migrated.
    //
    // `code` is what lands in paid_using and never changes; `label` is what the
    // UI shows and can be edited freely. Keeping them apart is the whole point —
    // inventoryController documents what happens when a display name doubles as
    // a join key, and renaming "GCash" must not split a report into two buckets.
    await sql`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        label VARCHAR(100) NOT NULL,
        icon VARCHAR(50),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Reports resolve every sale's label through this column, and the delete
    // dialog counts rows by it.
    await sql`
      CREATE INDEX IF NOT EXISTS idx_closed_sales_paid_using
        ON closed_sales (paid_using)
    `;

    // One-time bootstrap: the two methods that used to be hardcoded in the pay
    // dialog, plus anything else already sitting in closed_sales so no historical
    // sale is left showing a raw slug.
    //
    // Guarded on the table being empty rather than ON CONFLICT DO NOTHING, which
    // would resurrect a method the admin deliberately deleted on the next boot.
    // Both halves are one statement so the guard can't see a half-seeded table.
    await sql`
      WITH seed(code, label, icon) AS (
        VALUES ('cash', 'Cash', 'banknote'), ('gcash', 'GCash', 'smartphone')
      ),
      adopted AS (
        SELECT DISTINCT
          cs.paid_using AS code,
          INITCAP(REPLACE(cs.paid_using, '-', ' ')) AS label,
          NULL::text AS icon
        FROM closed_sales cs
        WHERE cs.paid_using IS NOT NULL
          AND cs.paid_using <> ''
          AND cs.paid_using NOT IN (SELECT code FROM seed)
      ),
      combined AS (
        SELECT code, label, icon, 0 AS grp FROM seed
        UNION ALL
        SELECT code, label, icon, 1 AS grp FROM adopted
      )
      INSERT INTO payment_methods (code, label, icon, sort_order)
      SELECT code, label, icon, ROW_NUMBER() OVER (ORDER BY grp, code)
      FROM combined
      WHERE NOT EXISTS (SELECT 1 FROM payment_methods)
    `;

    console.log("✅ Database initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing DB", error);
    process.exit(1);
  }
}
