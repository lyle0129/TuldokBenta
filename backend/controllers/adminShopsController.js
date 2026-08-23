// controllers/adminShopsController.js
// Creating and editing shops. Super admin only.
//
// ── The scoping exception, stated once per admin controller ──
// Every other controller in this codebase derives its scope from req.shopId and
// never from the request; that rule is the whole of ticket 04. The /api/admin
// controllers are the documented exception: they take the subject as an ordinary
// path or body parameter and mount no resolveShop, because a super admin acting
// across shops is the entire point of the surface.
//
// That is safe only because of the guard above it — routes/admin.js applies
// requireRealAuth and requireRole("super_admin") at the ROUTER level, and a super
// admin already reaches every shop. The parameter selects among things the caller
// may already touch; it widens nobody's access.
//
// If a route is ever added under /api/admin that a *manager* can reach, this
// reasoning collapses. Do not add one. Manager-scoped shop settings belong on a
// shop-scoped route with resolveShop — ticket 09 puts them there.
// ─────────────────────────────────────────────────────────────
//
// There is no delete route, and there must not be one: sales, inventory,
// services, payment methods and audit rows all reference shops(id).
// Deactivation is the removal path.

import { sql } from "../config/db.js";
import { auditQuery, diff, ACTIONS } from "../utils/audit.js";

/** Postgres unique_violation — a duplicate slug is the caller's problem, not a 500. */
const UNIQUE_VIOLATION = "23505";

/**
 * The Postgres error code, whether the driver threw it directly or wrapped it.
 *
 * A failing statement inside sql.transaction([...]) does not always surface the
 * same shape as a failing standalone query, and a duplicate slug answered with a
 * 500 would be indistinguishable from a real fault.
 */
const pgCode = (error) => error?.code ?? error?.sourceError?.code ?? null;

/** The receipt profile, plus the name. Everything a PUT is allowed to touch. */
const EDITABLE = [
  "name",
  "address_line",
  "contact_number",
  "logo_url",
  "receipt_footer",
  "receipt_paper_width_mm",
  "invoice_prefix",
];

/**
 * The stable key a shop is filed under, normalised the same way
 * paymentMethodsController normalises a method code — and for the same reason.
 * A display name that doubles as a key splits your data the moment somebody
 * renames it, so `slug` is derived once and then frozen.
 */
const slugify = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Trimmed text, or null for absent/blank — the shape the nullable columns want. */
const text = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * Validates the receipt profile and returns it, or throws a message.
 *
 * Shared by create and update so the two cannot drift into accepting different
 * things — the update path is the one people forget.
 */
const readProfile = (body) => {
  const paperWidth =
    body.receipt_paper_width_mm === undefined || body.receipt_paper_width_mm === null
      ? null
      : Number(body.receipt_paper_width_mm);

  if (paperWidth !== null && (!Number.isInteger(paperWidth) || paperWidth < 20 || paperWidth > 210)) {
    // 58mm and 80mm are the two thermal rolls in the wild; the range is wide
    // enough not to argue with anybody's printer and narrow enough to catch a
    // value typed in inches or points.
    return { error: "Receipt width must be a whole number of millimetres between 20 and 210" };
  }

  const prefix = text(body.invoice_prefix);
  if (prefix !== null && prefix.length > 10) {
    return { error: "Invoice prefix must be 10 characters or fewer" };
  }

  return {
    profile: {
      address_line: text(body.address_line),
      contact_number: text(body.contact_number),
      logo_url: text(body.logo_url),
      receipt_footer: text(body.receipt_footer),
      receipt_paper_width_mm: paperWidth,
      invoice_prefix: prefix,
    },
  };
};

/** Whether this shop has ever taken a sale, in either table. */
const hasSales = async (shopId) => {
  const [row] = await sql`
    SELECT (EXISTS (SELECT 1 FROM open_sales   WHERE shop_id = ${shopId})
         OR EXISTS (SELECT 1 FROM closed_sales WHERE shop_id = ${shopId})) AS any_sales
  `;
  return Boolean(row?.any_sales);
};

// GET /api/admin/shops
export const listShops = async (req, res) => {
  try {
    // Inactive shops included on purpose: this is the screen you reactivate one
    // from, and a shop missing from the only list that shows shops is a support
    // call rather than a feature.
    const shops = await sql`
      SELECT * FROM shops ORDER BY is_active DESC, name ASC
    `;
    res.status(200).json(shops);
  } catch (error) {
    console.error("Error listing shops", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// POST /api/admin/shops
export const createShop = async (req, res) => {
  try {
    const body = req.body ?? {};

    const name = text(body.name);
    if (!name) return res.status(400).json({ message: "Shop name is required" });

    // Derived from the name when it is not given, so the common case is one
    // field. Frozen from here on — see updateShop.
    const slug = slugify(body.slug || name);
    if (!slug) {
      return res.status(400).json({ message: "Slug must contain at least one letter or number" });
    }
    if (slug.length > 50) {
      return res.status(400).json({ message: "Slug must be 50 characters or fewer" });
    }

    const { error, profile } = readProfile(body);
    if (error) return res.status(400).json({ message: error });

    // The id is reserved before anything is written, and this is the whole
    // reason the handler looks like this. Both dependent inserts and the audit
    // row need the new shop's id, and a neon-http statement cannot pass a
    // RETURNING value to the next statement in the same batch — so the choice is
    // to allocate the id up front and write all three atomically, or to insert
    // the shop first and leave a window where it exists with no payment methods.
    //
    // A burned sequence value when the transaction fails is the entire cost.
    const [{ id }] = await sql`
      SELECT nextval(pg_get_serial_sequence('shops', 'id'))::int AS id
    `;

    const created = {
      id,
      name,
      slug,
      address_line: profile.address_line,
      contact_number: profile.contact_number,
      logo_url: profile.logo_url,
      receipt_footer: profile.receipt_footer ?? "Thank you for your purchase!",
      receipt_paper_width_mm: profile.receipt_paper_width_mm ?? 58,
      invoice_prefix: profile.invoice_prefix ?? "INV-",
    };

    const [rows] = await sql.transaction([
      sql`
        INSERT INTO shops (
          id, name, slug, address_line, contact_number, logo_url,
          receipt_footer, receipt_paper_width_mm, invoice_prefix
        ) VALUES (
          ${created.id}, ${created.name}, ${created.slug}, ${created.address_line},
          ${created.contact_number}, ${created.logo_url}, ${created.receipt_footer},
          ${created.receipt_paper_width_mm}, ${created.invoice_prefix}
        )
        RETURNING *
      `,
      // Seeded in the same transaction, because a shop that exists but cannot
      // take a payment is worse than a shop that failed to be created. The seed
      // in initDB.js is guarded on the whole payment_methods table being empty,
      // so it fires once ever and those rows belong to Shop 1 — a shop created
      // here would otherwise open with an empty pay dialog and no obvious cause.
      //
      // Inventory and services are deliberately NOT copied from another shop. A
      // new branch starts empty; cloning a catalog is a separate feature with
      // its own questions (prices? stock? sort order?) that nobody has asked for.
      sql`
        INSERT INTO payment_methods (shop_id, code, label, icon, sort_order)
        VALUES (${id}, 'cash', 'Cash', 'banknote', 1),
               (${id}, 'gcash', 'GCash', 'smartphone', 2)
      `,
      auditQuery(req, {
        action: ACTIONS.shop.create,
        shop_id: id,
        entity_type: "shop",
        entity_id: id,
        entity_label: created.slug,
        changes: { after: created },
      }),
    ]);

    // The invoice sequence needs nothing: allocateInvoice COALESCEs a shop with
    // no sales to 0 and hands out 1, so this shop's first receipt is its own
    // prefix + 0001.
    res.status(201).json(rows[0]);
  } catch (error) {
    if (pgCode(error) === UNIQUE_VIOLATION) {
      return res.status(409).json({ message: "That shop slug is already taken" });
    }
    console.error("Error creating shop", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// PUT /api/admin/shops/:id
export const updateShop = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body ?? {};

    const [before] = await sql`SELECT * FROM shops WHERE id = ${id}`;
    if (!before) return res.status(404).json({ message: "Shop not found" });

    // Immutable, and refused rather than silently ignored. Every row in five
    // tables is filed under this shop, and a caller who believes they renamed
    // the key needs to be told they did not.
    if (body.slug !== undefined && slugify(body.slug) !== before.slug) {
      return res.status(400).json({ message: "A shop's slug cannot be changed" });
    }

    const name = body.name === undefined ? before.name : text(body.name);
    if (!name) return res.status(400).json({ message: "Shop name is required" });

    const { error, profile } = readProfile(body);
    if (error) return res.status(400).json({ message: error });

    // Absent means "leave it", which is why each column is COALESCEd against
    // itself rather than overwritten with a null the caller never sent.
    const next = {
      name,
      address_line: body.address_line === undefined ? before.address_line : profile.address_line,
      contact_number:
        body.contact_number === undefined ? before.contact_number : profile.contact_number,
      logo_url: body.logo_url === undefined ? before.logo_url : profile.logo_url,
      receipt_footer:
        body.receipt_footer === undefined ? before.receipt_footer : profile.receipt_footer,
      receipt_paper_width_mm:
        profile.receipt_paper_width_mm ?? before.receipt_paper_width_mm,
      invoice_prefix: profile.invoice_prefix ?? before.invoice_prefix,
    };

    const [rows] = await sql.transaction([
      sql`
        UPDATE shops
           SET name = ${next.name},
               address_line = ${next.address_line},
               contact_number = ${next.contact_number},
               logo_url = ${next.logo_url},
               receipt_footer = ${next.receipt_footer},
               receipt_paper_width_mm = ${next.receipt_paper_width_mm},
               invoice_prefix = ${next.invoice_prefix}
         WHERE id = ${id}
         RETURNING *
      `,
      auditQuery(req, {
        action: ACTIONS.shop.update,
        shop_id: id,
        entity_type: "shop",
        entity_id: id,
        entity_label: before.slug,
        changes: diff(before, next, EDITABLE),
      }),
    ]);

    const updated = rows[0];

    // Numbering does not reset — ticket 02 decoupled invoice_seq from the
    // displayed string precisely so it could not — but receipts either side of
    // the change look unrelated, and only this shop's own history shows it.
    // Surfaced as a field rather than a refusal: it is a real decision an owner
    // is allowed to make, and ticket 10 puts the sentence in front of them.
    const prefixChanged = next.invoice_prefix !== before.invoice_prefix;
    const warning =
      prefixChanged && (await hasSales(id))
        ? "This shop already has sales. Existing invoice numbers keep their old prefix, " +
          "so receipts before and after this change will look unrelated. Numbering itself " +
          "does not restart."
        : null;

    res.status(200).json(warning ? { ...updated, warning } : updated);
  } catch (error) {
    if (pgCode(error) === UNIQUE_VIOLATION) {
      return res.status(409).json({ message: "That shop slug is already taken" });
    }
    console.error("Error updating shop", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * POST /api/admin/shops/:id/deactivate | /reactivate
 *
 * A factory rather than two handlers: the pair differ by one boolean and one
 * action string, and writing them separately is how the second one ends up
 * missing its audit row.
 */
export const setShopActive = (active) => async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [before] = await sql`SELECT * FROM shops WHERE id = ${id}`;
    if (!before) return res.status(404).json({ message: "Shop not found" });

    // Already in the requested state: answer with the row rather than writing a
    // second audit event that records nothing having changed.
    if (before.is_active === active) {
      return res.status(200).json(before);
    }

    const [rows] = await sql.transaction([
      sql`UPDATE shops SET is_active = ${active} WHERE id = ${id} RETURNING *`,
      auditQuery(req, {
        action: active ? ACTIONS.shop.reactivate : ACTIONS.shop.deactivate,
        shop_id: id,
        entity_type: "shop",
        entity_id: id,
        entity_label: before.slug,
        changes: { before: { is_active: before.is_active }, after: { is_active: active } },
      }),
    ]);

    // A deactivated shop disappears from every user's picker, because both
    // branches of shopsForUser and resolveShop filter on is_active. Its rows are
    // untouched and come back the moment it is reactivated.
    res.status(200).json(rows[0]);
  } catch (error) {
    console.error("Error changing shop status", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
