// controllers/shopProfileController.js
//
// A shop's own receipt profile: the header a receipt prints, edited by the
// manager who runs that shop rather than by a super admin.
//
// This lives outside /api/admin deliberately. That router accepts a shop id as
// an ordinary path parameter, and the only thing that makes it safe is that
// every caller reaching it already reaches every shop — a manager-reachable
// route there would break the argument. So the shop comes from req.shopId,
// resolved by resolveShop from a validated header, and a manager cannot name a
// shop they are not assigned to.
//
// The logo handlers are the exception: they are also mounted under /api/admin,
// where the console needs them, and take the shop from the path there. Both
// mounts share one implementation so the two cannot accept different images.

import { sql } from "../config/db.js";
import { auditQuery, diff, ACTIONS } from "../utils/audit.js";
import {
  shopColumns,
  shopColumnsWithLogo,
  toProfile,
  dataUriFrom,
  readImageBody,
} from "../utils/shopLogo.js";
import {
  text,
  readProfile,
  mergeProfile,
  prefixWarning,
  EDITABLE,
} from "../utils/shopProfile.js";

/**
 * The shop a logo request is about.
 *
 * req.shopId on the scoped mount, where resolveShop has already established the
 * caller may act on it. req.params.id on the admin mount, where requireRole has
 * established the caller may act on every shop.
 *
 * Anything unparseable becomes null rather than NaN, which every caller below
 * then turns into a 404 by finding no row — `WHERE id = NULL` matches nothing,
 * where `WHERE id = NaN` is a driver error and a 500.
 */
const subjectShopId = (req) => {
  if (req.shopId) return req.shopId;
  const id = Number(req.params?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * What this route's PUT can change, which is EDITABLE minus `logo_url`.
 *
 * The manager-facing form has no logo URL field — a logo is uploaded, and the
 * remaining `logo_url` is the read-only fallback a shop prints until it has one.
 * So the UPDATE below does not name that column, and the audit key list must
 * match the statement exactly: a diff listing a column the statement never wrote
 * would record a change that did not happen.
 */
const PROFILE_EDITABLE = EDITABLE.filter((column) => column !== "logo_url");

const fail = (res, error, context) => {
  console.error(context, error);
  return res.status(500).json({ message: "Internal Server Error" });
};

// GET /api/shop-profile
export const getShopProfile = async (req, res) => {
  try {
    // The logo comes back as base64 here, and only here. This is the response a
    // till caches and prints from, so the image has to travel inline: a receipt
    // popup's <img> can send no Authorization header, and the offline page has
    // no connection to fetch one over.
    const [row] = await sql`
      SELECT ${shopColumnsWithLogo} FROM shops WHERE id = ${req.shopId}
    `;

    if (!row) return res.status(404).json({ message: "Shop not found" });

    res.status(200).json(toProfile(row));
  } catch (error) {
    return fail(res, error, "Error loading shop profile");
  }
};

// PUT /api/shop-profile
export const updateShopProfile = async (req, res) => {
  try {
    const id = req.shopId;
    const body = req.body ?? {};

    const [before] = await sql`SELECT ${shopColumns} FROM shops WHERE id = ${id}`;
    if (!before) return res.status(404).json({ message: "Shop not found" });

    const name = body.name === undefined ? before.name : text(body.name);
    if (!name) return res.status(400).json({ message: "Shop name is required" });

    const { error, profile } = readProfile(body);
    if (error) return res.status(400).json({ message: error });

    const next = mergeProfile(before, body, profile, name);

    // The columns are named one by one rather than built from the body, which is
    // what makes the allowlist structural: `slug` and `is_active` are not
    // reachable through this statement no matter what a client sends, and the
    // only way to add one is to write it here on purpose.
    const [rows] = await sql.transaction([
      sql`
        UPDATE shops
           SET name = ${next.name},
               address_line = ${next.address_line},
               contact_number = ${next.contact_number},
               receipt_footer = ${next.receipt_footer},
               receipt_paper_width_mm = ${next.receipt_paper_width_mm},
               invoice_prefix = ${next.invoice_prefix}
         WHERE id = ${id}
         RETURNING ${shopColumnsWithLogo}
      `,
      auditQuery(req, {
        action: ACTIONS.shop.update,
        entity_type: "shop",
        entity_id: id,
        entity_label: before.slug,
        changes: diff(before, next, PROFILE_EDITABLE),
      }),
    ]);

    const updated = toProfile(rows[0]);
    const warning = await prefixWarning(id, before, next);

    res.status(200).json(warning ? { ...updated, warning } : updated);
  } catch (error) {
    return fail(res, error, "Error updating shop profile");
  }
};

// GET /api/admin/shops/:id/logo
//
// Logo-only rather than a whole row, because the console's list deliberately
// carries `has_logo` instead of the image. This is how one shop's image is
// fetched when a modal actually needs to show it.
export const getShopLogo = async (req, res) => {
  try {
    const id = subjectShopId(req);

    const [row] = await sql`
      SELECT logo_mime, logo_updated_at, encode(logo_blob, 'base64') AS logo_b64
        FROM shops WHERE id = ${id}
    `;

    if (!row) return res.status(404).json({ message: "Shop not found" });

    res.status(200).json({
      logo_data_url: dataUriFrom(row),
      logo_updated_at: row.logo_updated_at,
    });
  } catch (error) {
    return fail(res, error, "Error loading shop logo");
  }
};

/**
 * POST /api/shop-profile/logo | /api/admin/shops/:id/logo
 *
 * The response carries the stored image back as a data URI rather than just an
 * acknowledgement, so the caller's cache holds exactly what a receipt will print
 * without a second round trip to find out.
 */
export const uploadShopLogo = async (req, res) => {
  try {
    const id = subjectShopId(req);

    const { error, buffer, mime } = readImageBody(req);
    if (error) return res.status(400).json({ message: error });

    const [before] = await sql`
      SELECT slug, logo_mime, (logo_blob IS NOT NULL) AS has_logo
        FROM shops WHERE id = ${id}
    `;
    if (!before) return res.status(404).json({ message: "Shop not found" });

    // The Buffer is interpolated directly: the neon driver hex-encodes it and
    // appends a ::bytea cast of its own accord.
    const [rows] = await sql.transaction([
      sql`
        UPDATE shops
           SET logo_blob = ${buffer},
               logo_mime = ${mime},
               logo_updated_at = NOW()
         WHERE id = ${id}
         RETURNING logo_mime, logo_updated_at, encode(logo_blob, 'base64') AS logo_b64
      `,
      auditQuery(req, {
        action: ACTIONS.shop.update,
        shop_id: id,
        entity_type: "shop",
        entity_id: id,
        entity_label: before.slug,
        // Never the bytes. audit_log.changes is JSONB the console renders as a
        // change summary; half a megabyte of base64 in there would be unreadable
        // to a person and would bloat every audit query that touches the row.
        changes: diff(
          { has_logo: before.has_logo, logo_mime: before.logo_mime },
          { has_logo: true, logo_mime: mime },
          ["has_logo", "logo_mime"]
        ),
      }),
    ]);

    res.status(200).json({
      logo_data_url: dataUriFrom(rows[0]),
      logo_updated_at: rows[0].logo_updated_at,
    });
  } catch (error) {
    return fail(res, error, "Error uploading shop logo");
  }
};

// DELETE /api/shop-profile/logo | /api/admin/shops/:id/logo
export const deleteShopLogo = async (req, res) => {
  try {
    const id = subjectShopId(req);

    const [before] = await sql`
      SELECT slug, logo_mime, (logo_blob IS NOT NULL) AS has_logo
        FROM shops WHERE id = ${id}
    `;
    if (!before) return res.status(404).json({ message: "Shop not found" });

    // Nothing to remove: answer with the same shape rather than writing a second
    // audit event recording that nothing changed, which is how setShopActive
    // handles its own no-op.
    if (!before.has_logo) {
      return res.status(200).json({ logo_data_url: null, logo_updated_at: null });
    }

    await sql.transaction([
      sql`
        UPDATE shops
           SET logo_blob = NULL, logo_mime = NULL, logo_updated_at = NULL
         WHERE id = ${id}
      `,
      auditQuery(req, {
        action: ACTIONS.shop.update,
        shop_id: id,
        entity_type: "shop",
        entity_id: id,
        entity_label: before.slug,
        changes: diff(
          { has_logo: true, logo_mime: before.logo_mime },
          { has_logo: false, logo_mime: null },
          ["has_logo", "logo_mime"]
        ),
      }),
    ]);

    // The shop may still have a legacy logo_url, which is what it falls back to
    // printing. Removing the upload is not the same as removing the logo, and
    // the caller refetching its profile is what shows it which one it has.
    res.status(200).json({ logo_data_url: null, logo_updated_at: null });
  } catch (error) {
    return fail(res, error, "Error removing shop logo");
  }
};
