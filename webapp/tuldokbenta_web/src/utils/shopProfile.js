// utils/shopProfile.js
// A shop's receipt profile, moving between a row and a form.
//
// Shared by the add and edit modals for the same reason adminShopsController
// validates create and update through a single `readProfile`: the two paths
// drifting into accepting different things is the failure mode, and the update
// path is the one people forget.

/** A blank profile, as the create form starts. Strings throughout — it is a form. */
export const emptyProfile = {
  address_line: "",
  contact_number: "",
  logo_url: "",
  receipt_footer: "Thank you for your purchase!",
  receipt_paper_width_mm: "58",
  invoice_prefix: "INV-",
};

/** An existing shop row as form state. */
export const profileFrom = (shop) => ({
  address_line: shop?.address_line ?? "",
  contact_number: shop?.contact_number ?? "",
  logo_url: shop?.logo_url ?? "",
  receipt_footer: shop?.receipt_footer ?? "",
  receipt_paper_width_mm: String(shop?.receipt_paper_width_mm ?? 58),
  invoice_prefix: shop?.invoice_prefix ?? "INV-",
});

/**
 * Form state as the API's body.
 *
 * Blank text goes as `null` rather than `""`, which is what the nullable columns
 * mean by absent — adminShopsController's `text()` does the same normalisation
 * server-side, and matching it here keeps a saved-then-reopened form identical
 * to the one that was saved.
 */
export const profileBody = (form) => {
  const text = (value) => {
    const trimmed = String(value ?? "").trim();
    return trimmed === "" ? null : trimmed;
  };

  return {
    address_line: text(form.address_line),
    contact_number: text(form.contact_number),
    logo_url: text(form.logo_url),
    receipt_footer: text(form.receipt_footer),
    receipt_paper_width_mm: Number(form.receipt_paper_width_mm) || 58,
    invoice_prefix: text(form.invoice_prefix),
  };
};
