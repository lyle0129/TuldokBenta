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

    // ─────────────────────── Multi-shop tenancy ───────────────────────
    //
    // Everything below gives each of the five tenant tables an owning shop, so
    // a second shop can stock the same item names and issue the same invoice
    // numbers as the first. Nothing *reads* shop_id yet — the controllers are
    // untouched and the API behaves exactly as it did before. The queries start
    // filtering on it in ticket 04.
    //
    // The statement order below is load-bearing and must not be rearranged.
    // There is no migration tool here: initDB runs on every boot and a failure
    // exits the process, so a constraint applied before its backfill does not
    // merely fail — it stops the backend starting at all. Every statement is
    // written to be a no-op on the second and every later boot.

    // Shops are the tenant. `slug` is the stable key and `name` is the freely
    // editable display value, split for the same reason payment_methods splits
    // `code` from `label` above: a display name that doubles as a key splits
    // your data the moment somebody renames it.
    //
    // The receipt columns are here rather than in a table of their own because
    // they are one-to-one with the shop and are read together as one header.
    // They currently live as literals in the frontend's printInvoice.js; ticket
    // 09 is what makes the receipt read them from here.
    await sql`
      CREATE TABLE IF NOT EXISTS shops (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(50) UNIQUE NOT NULL,
        address_line VARCHAR(255),
        contact_number VARCHAR(50),
        logo_url TEXT,
        receipt_footer VARCHAR(255) DEFAULT 'Thank you for your purchase!',
        receipt_paper_width_mm INT NOT NULL DEFAULT 58,
        invoice_prefix VARCHAR(10) NOT NULL DEFAULT 'INV-',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // The shop that already exists, seeded with the exact values hardcoded in
    // webapp/tuldokbenta_web/src/utils/printInvoice.js today, so a receipt
    // printed after this migration is identical to one printed before it.
    //
    // Guarded on the table being empty rather than ON CONFLICT DO NOTHING, for
    // the same reason the payment_methods seed above is: a shop an admin
    // deliberately deleted must not be resurrected on the next boot.
    await sql`
      INSERT INTO shops (name, slug, address_line, contact_number, logo_url, receipt_footer)
      SELECT 'SPINCREDIBLE', 'spincredible', 'Rizal Street Ext', 'Mo: 0962-683-7430',
             'https://i.ibb.co/NFtDrgj/SPINCREDIBLE.png', 'Thank you for your purchase!'
      WHERE NOT EXISTS (SELECT 1 FROM shops)
    `;

    // The five tables that hold one shop's data. Everything else in the schema
    // is either global or hangs off one of these.
    const scopedTables = [
      "inventory",
      "services",
      "payment_methods",
      "open_sales",
      "closed_sales",
    ];

    for (const table of scopedTables) {
      // Added nullable, never as `NOT NULL DEFAULT 1`: that would hardcode an
      // id this code has no business knowing, and it has to be backfilled
      // before it can be constrained anyway.
      await sql`ALTER TABLE ${sql.unsafe(table)} ADD COLUMN IF NOT EXISTS shop_id INT`;

      // Every pre-existing row belongs to the shop that already existed.
      // Resolved by subquery rather than as a literal so a database seeded in
      // any other order still lands on its own first shop. Only touches NULLs,
      // so every boot after the first updates zero rows.
      await sql`
        UPDATE ${sql.unsafe(table)}
           SET shop_id = (SELECT id FROM shops ORDER BY id LIMIT 1)
         WHERE shop_id IS NULL
      `;

      // TEMPORARY, and removed in ticket 04.
      //
      // Not one INSERT in the codebase passes shop_id yet — ticket 04 is what
      // adds it. Without a default, the SET NOT NULL below would stop every
      // sale, item, service and payment method from being created the moment
      // this deploys, and this ticket is supposed to be invisible to the shop.
      // It would also break the payment_methods seed above, which re-runs if an
      // admin ever deletes every method.
      //
      // A column default cannot contain a subquery, so the id is read into a
      // variable and formatted in — still resolved from the table, never a
      // literal 1. Ticket 04 drops these defaults once every INSERT names its
      // shop, at which point a statement that forgot one must fail loudly
      // rather than silently land in the first shop.
      await sql`
        DO $$
        DECLARE first_shop INT;
        BEGIN
          SELECT id INTO first_shop FROM shops ORDER BY id LIMIT 1;
          EXECUTE format(
            'ALTER TABLE ${sql.unsafe(table)} ALTER COLUMN shop_id SET DEFAULT %s',
            first_shop
          );
        END $$;
      `;

      // Only safe after the backfill above: SET NOT NULL scans the table and
      // throws on any remaining NULL. A no-op when the column is already NOT
      // NULL, which is what makes re-running this whole block free.
      await sql`ALTER TABLE ${sql.unsafe(table)} ALTER COLUMN shop_id SET NOT NULL`;

      await sql`
        DO $$ BEGIN
          ALTER TABLE ${sql.unsafe(table)}
            ADD CONSTRAINT ${sql.unsafe(`${table}_shop_fk`)}
            FOREIGN KEY (shop_id) REFERENCES shops(id);
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `;
    }

    // The globally UNIQUE columns that make a second shop impossible today.
    // Each becomes UNIQUE per shop instead. The dropped names are the ones
    // Postgres generates for a column-level UNIQUE (<table>_<column>_key); the
    // new ones are named explicitly so a later ticket can drop them by name
    // without having to guess.
    const uniqueSwaps = [
      {
        table: "inventory",
        column: "item_name",
        oldName: "inventory_item_name_key",
        newName: "inventory_shop_item_unique",
      },
      {
        table: "services",
        column: "service_name",
        oldName: "services_service_name_key",
        newName: "services_shop_name_unique",
      },
      {
        table: "payment_methods",
        column: "code",
        oldName: "payment_methods_code_key",
        newName: "payment_methods_shop_code_unique",
      },
      {
        table: "open_sales",
        column: "invoice_number",
        oldName: "open_sales_invoice_number_key",
        newName: "open_sales_shop_invoice_unique",
      },
      {
        table: "closed_sales",
        column: "invoice_number",
        oldName: "closed_sales_invoice_number_key",
        newName: "closed_sales_shop_invoice_unique",
      },
    ];

    // Runs only after the loop above: a composite UNIQUE containing shop_id
    // does not mean what it says while NULLs remain, because NULLs never
    // conflict in a unique index and every un-backfilled row would be allowed.
    for (const { table, column, oldName, newName } of uniqueSwaps) {
      // A name that does not match is silently ignored here, and the symptom
      // only shows up much later as "the second shop cannot be created" — so
      // the verification step queries pg_constraint instead of trusting this.
      await sql`ALTER TABLE ${sql.unsafe(table)} DROP CONSTRAINT IF EXISTS ${sql.unsafe(oldName)}`;

      // Dropping the old UNIQUE takes its index with it. That is fine: shop_id
      // leads the new composite index, so the `WHERE shop_id = $1 AND
      // <column> = $2` lookups ticket 04 writes are still served by it.
      await sql`
        DO $$ BEGIN
          ALTER TABLE ${sql.unsafe(table)}
            ADD CONSTRAINT ${sql.unsafe(newName)} UNIQUE (shop_id, ${sql.unsafe(column)});
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `;
    }

    // The real invoice sequence. Numbering is derived today by parsing
    // `^INV-([0-9]+)$` out of invoice_number, so the moment a shop edits its
    // invoice_prefix the parse stops matching, MAX returns 0, and the shop
    // restarts at 1 — colliding with its own history. invoice_number stays the
    // authoritative display value and is not touched here.
    await sql`ALTER TABLE open_sales ADD COLUMN IF NOT EXISTS invoice_seq INT`;
    await sql`ALTER TABLE closed_sales ADD COLUMN IF NOT EXISTS invoice_seq INT`;

    // Stays nullable on purpose. `substring(... from regex)` yields NULL for a
    // number that does not fit the format, and casting NULL is NULL, so a
    // hand-edited "INV-abc" stores NULL instead of failing the migration.
    // There is no correct integer to invent for a number that was never in the
    // series, and MAX() ignoring it reproduces exactly today's behaviour —
    // the same tolerance utils/invoiceNumber.js already documents.
    await sql`
      UPDATE open_sales
         SET invoice_seq = (substring(invoice_number from '^INV-([0-9]+)$'))::int
       WHERE invoice_seq IS NULL
    `;

    await sql`
      UPDATE closed_sales
         SET invoice_seq = (substring(invoice_number from '^INV-([0-9]+)$'))::int
       WHERE invoice_seq IS NULL
    `;

    // Every list ticket 04 writes gains a shop predicate, so shop_id has to
    // lead these indexes or the additional filter turns each one into a table
    // scan of every shop's rows.
    await sql`
      CREATE INDEX IF NOT EXISTS idx_open_sales_shop_created
        ON open_sales (shop_id, created_at)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_closed_sales_shop_paid
        ON closed_sales (shop_id, paid_at)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_closed_sales_shop_created
        ON closed_sales (shop_id, created_at)
    `;

    // Replaces the old single-column index on paid_using. Reports resolve every
    // sale's label through that column and the delete dialog counts rows by it,
    // both of which become per-shop questions.
    await sql`
      CREATE INDEX IF NOT EXISTS idx_closed_sales_shop_method
        ON closed_sales (shop_id, paid_using)
    `;

    // Dropped last, after its replacement exists, so there is never a boot
    // during which paid_using has no index at all.
    await sql`DROP INDEX IF EXISTS idx_closed_sales_paid_using`;

    console.log("✅ Database initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing DB", error);
    process.exit(1);
  }
}
