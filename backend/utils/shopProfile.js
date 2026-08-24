// utils/shopProfile.js
//
// Validating a shop's receipt profile, and the one warning editing it can
// produce.
//
// Extracted from adminShopsController when ticket 09 added a second way in. The
// super admin edits any shop through /api/admin/shops/:id and a manager edits
// their own through /api/shop-profile; the two accepting different things is the
// failure mode, and the manager path is the one that would be forgotten.

import { sql } from "../config/db.js";

/** Postgres unique_violation — a duplicate slug is the caller's problem, not a 500. */
export const UNIQUE_VIOLATION = "23505";

/**
 * The Postgres error code, whether the driver threw it directly or wrapped it.
 *
 * A failing statement inside sql.transaction([...]) does not always surface the
 * same shape as a failing standalone query, and a duplicate slug answered with a
 * 500 would be indistinguishable from a real fault.
 */
export const pgCode = (error) => error?.code ?? error?.sourceError?.code ?? null;

/**
 * The receipt profile, plus the name. Everything a PUT is allowed to touch.
 *
 * `logo_url` is on the list because it is still a column and still the fallback
 * a shop prints when it has uploaded no image. It is no longer editable from any
 * form — the logo moves through the blob endpoints — but a caller that sends it
 * is honoured, and the audit diff has to be able to see it change.
 *
 * `slug` and `is_active` are absent deliberately, and unreachable structurally:
 * neither appears in any UPDATE either caller builds.
 */
export const EDITABLE = [
  "name",
  "address_line",
  "contact_number",
  "logo_url",
  "receipt_footer",
  "receipt_paper_width_mm",
  "invoice_prefix",
];

/** Trimmed text, or null for absent/blank — the shape the nullable columns want. */
export const text = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * Validates the receipt profile and returns it, or a message explaining the
 * refusal.
 */
export const readProfile = (body) => {
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

/**
 * Merges a validated profile onto the row it is replacing.
 *
 * Absent means "leave it", which is why every field is resolved against
 * `before` rather than overwritten with a null the caller never sent. A form
 * that submits four fields must not blank the other three.
 */
export const mergeProfile = (before, body, profile, name) => ({
  name,
  address_line: body.address_line === undefined ? before.address_line : profile.address_line,
  contact_number:
    body.contact_number === undefined ? before.contact_number : profile.contact_number,
  logo_url: body.logo_url === undefined ? before.logo_url : profile.logo_url,
  receipt_footer:
    body.receipt_footer === undefined ? before.receipt_footer : profile.receipt_footer,
  receipt_paper_width_mm: profile.receipt_paper_width_mm ?? before.receipt_paper_width_mm,
  invoice_prefix: profile.invoice_prefix ?? before.invoice_prefix,
});

/** Whether this shop has ever taken a sale, in either table. */
export const hasSales = async (shopId) => {
  const [row] = await sql`
    SELECT (EXISTS (SELECT 1 FROM open_sales   WHERE shop_id = ${shopId})
         OR EXISTS (SELECT 1 FROM closed_sales WHERE shop_id = ${shopId})) AS any_sales
  `;
  return Boolean(row?.any_sales);
};

/**
 * The sentence a changed invoice prefix earns, or null.
 *
 * Numbering does not reset — ticket 02 decoupled invoice_seq from the displayed
 * string precisely so it could not — but receipts either side of the change look
 * unrelated, and only this shop's own history shows it. Surfaced as a field
 * rather than a refusal: it is a real decision an owner is allowed to make, and
 * both edit surfaces put the sentence in front of them.
 */
export const prefixWarning = async (shopId, before, next) => {
  if (next.invoice_prefix === before.invoice_prefix) return null;
  if (!(await hasSales(shopId))) return null;

  return (
    "This shop already has sales. Existing invoice numbers keep their old prefix, " +
    "so receipts before and after this change will look unrelated. Numbering itself " +
    "does not restart."
  );
};
