// utils/shopLogo.js
//
// A shop's receipt logo, moving between raw bytes and the shape a receipt can
// print. Shared by the shop-scoped route a manager reaches and the /api/admin
// route the super-admin console reaches, so the two cannot drift into accepting
// different images or serving them differently.

import express from "express";
import { sql } from "../config/db.js";

/**
 * The image types a receipt may carry.
 *
 * No SVG, and that is a security decision rather than a compatibility one. The
 * logo is embedded as a data URI into a document built by string concatenation
 * and handed to document.write, so an SVG would execute its own script in the
 * popup with the app's origin. The three raster formats cannot.
 */
export const ALLOWED_LOGO_MIME = ["image/png", "image/jpeg", "image/webp"];

/**
 * 512 KB of image, which is ~700 KB once base64 inflates it by a third.
 *
 * The ceiling is set by localStorage rather than by the database: the profile is
 * held twice on a till — once in the persisted query cache and once in the
 * offline catalog snapshot — against a quota of about 5 MB. A logo printed at
 * 58 mm has no use for more than this anyway.
 */
export const MAX_LOGO_BYTES = 512 * 1024;

/**
 * The receipt profile's columns, never the blob.
 *
 * `SELECT *` on `shops` would drag every logo's bytes across the wire on every
 * listing, so the bytes are only ever selected deliberately — and even then as
 * base64 computed by Postgres, which sidesteps any question of how the neon-http
 * driver decodes BYTEA on the way back.
 */
export const shopColumns = sql.unsafe(`
  id, name, slug, address_line, contact_number, logo_url,
  receipt_footer, receipt_paper_width_mm, invoice_prefix,
  is_active, created_at, logo_mime, logo_updated_at,
  (logo_blob IS NOT NULL) AS has_logo
`);

/** The same columns, plus the logo itself as base64. */
export const shopColumnsWithLogo = sql.unsafe(`
  id, name, slug, address_line, contact_number, logo_url,
  receipt_footer, receipt_paper_width_mm, invoice_prefix,
  is_active, created_at, logo_mime, logo_updated_at,
  (logo_blob IS NOT NULL) AS has_logo,
  encode(logo_blob, 'base64') AS logo_b64
`);

/** The data URI a receipt prints, or null when this shop has uploaded nothing. */
export const dataUriFrom = (row) =>
  row?.logo_b64 ? `data:${row.logo_mime};base64,${row.logo_b64}` : null;

/**
 * A row selected with `shopColumnsWithLogo`, as the profile the API serves.
 *
 * `logo_b64` is replaced by `logo_data_url` rather than sent alongside it: one
 * representation of the image reaches the client, and it is the one the receipt
 * can use directly.
 */
export const toProfile = (row) => {
  if (!row) return null;
  const { logo_b64: _ignored, ...rest } = row;
  return { ...rest, logo_data_url: dataUriFrom(row) };
};

/**
 * express.raw for exactly the image types above, wrapped so its failures answer
 * in JSON.
 *
 * There is no error-handling middleware anywhere in this backend. Left
 * unwrapped, a body over the limit reaches Express's default handler and comes
 * back as an HTML error page — which api.js parses as JSON and reports as
 * "Request failed", losing the one detail the person needs.
 *
 * Mounted per route, never globally: express.json() keeps its own default limit
 * because no image ever travels through the JSON path.
 */
const raw = express.raw({ type: ALLOWED_LOGO_MIME, limit: MAX_LOGO_BYTES });

export const rawImage = (req, res, next) =>
  raw(req, res, (error) => {
    if (!error) return next();

    if (error.type === "entity.too.large") {
      return res.status(413).json({
        message: `That image is too large. The limit is ${Math.floor(MAX_LOGO_BYTES / 1024)} KB.`,
      });
    }

    console.error("Error reading logo body", error);
    return res.status(400).json({ message: "That image could not be read" });
  });

/**
 * The uploaded image, or the reason it was refused.
 *
 * express.raw only fills req.body when the Content-Type is one it was told to
 * parse; anything else arrives as the empty object express.json left behind. So
 * "not a Buffer" is how a wrong content type presents, and it has to be checked
 * rather than assumed.
 */
export const readImageBody = (req) => {
  if (!Buffer.isBuffer(req.body)) {
    return {
      error: `Send the image itself with a Content-Type of ${ALLOWED_LOGO_MIME.join(", ")}`,
    };
  }

  if (req.body.length === 0) {
    return { error: "That image is empty" };
  }

  // Whatever express.raw matched on, minus any charset parameter.
  const mime = String(req.header("content-type") ?? "").split(";")[0].trim();
  if (!ALLOWED_LOGO_MIME.includes(mime)) {
    return { error: `Logos must be one of ${ALLOWED_LOGO_MIME.join(", ")}` };
  }

  return { buffer: req.body, mime };
};
