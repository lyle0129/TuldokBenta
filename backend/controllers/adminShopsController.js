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
import { shopColumns } from "../utils/shopLogo.js";
import {
  UNIQUE_VIOLATION,
  pgCode,
  EDITABLE,
  text,
  readProfile,
  mergeProfile,
  prefixWarning,
} from "../utils/shopProfile.js";

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

// GET /api/admin/shops
export const listShops = async (req, res) => {
  try {
    // Inactive shops included on purpose: this is the screen you reactivate one
    // from, and a shop missing from the only list that shows shops is a support
    // call rather than a feature.
    //
    // An explicit column list rather than the SELECT * this used to be. Ticket
    // 09 put the logo's bytes in this table, and a console listing ten shops
    // would otherwise drag five megabytes of image through the driver to render
    // ten cards. `has_logo` is what the list actually needs; the image itself is
    // fetched one shop at a time from /shops/:id/logo.
    const shops = await sql`
      SELECT ${shopColumns} FROM shops ORDER BY is_active DESC, name ASC
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
        RETURNING ${shopColumns}
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

    const [before] = await sql`SELECT ${shopColumns} FROM shops WHERE id = ${id}`;
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

    const next = mergeProfile(before, body, profile, name);

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
         RETURNING ${shopColumns}
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
    const warning = await prefixWarning(id, before, next);

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

    const [before] = await sql`SELECT ${shopColumns} FROM shops WHERE id = ${id}`;
    if (!before) return res.status(404).json({ message: "Shop not found" });

    // Already in the requested state: answer with the row rather than writing a
    // second audit event that records nothing having changed.
    if (before.is_active === active) {
      return res.status(200).json(before);
    }

    const [rows] = await sql.transaction([
      sql`UPDATE shops SET is_active = ${active} WHERE id = ${id} RETURNING ${shopColumns}`,
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
