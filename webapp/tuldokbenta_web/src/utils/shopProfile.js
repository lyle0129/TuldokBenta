// utils/shopProfile.js
// A shop's receipt profile, moving between a row and a form.
//
// Shared by the add and edit modals for the same reason adminShopsController
// validates create and update through a single `readProfile`: the two paths
// drifting into accepting different things is the failure mode, and the update
// path is the one people forget.

/**
 * A blank profile, as the create form starts. Strings throughout — it is a form.
 *
 * `logo_data_url` is the uploaded image, held here so the live preview can show
 * a newly picked file before it has been sent anywhere. `logo_url` is the older
 * hotlinked value: still carried so the preview renders it as the fallback a
 * shop prints until it uploads something, but no form edits it any more.
 */
export const emptyProfile = {
  address_line: "",
  contact_number: "",
  logo_url: "",
  logo_data_url: "",
  receipt_footer: "Thank you for your purchase!",
  receipt_paper_width_mm: "58",
  invoice_prefix: "INV-",
};

/** An existing shop row as form state. */
export const profileFrom = (shop) => ({
  address_line: shop?.address_line ?? "",
  contact_number: shop?.contact_number ?? "",
  logo_url: shop?.logo_url ?? "",
  logo_data_url: shop?.logo_data_url ?? "",
  receipt_footer: shop?.receipt_footer ?? "",
  receipt_paper_width_mm: String(shop?.receipt_paper_width_mm ?? 58),
  invoice_prefix: shop?.invoice_prefix ?? "INV-",
});

/**
 * Form state as the API's body.
 *
 * Blank text goes as `null` rather than `""`, which is what the nullable columns
 * mean by absent — the server's `text()` does the same normalisation, and
 * matching it here keeps a saved-then-reopened form identical to the one that
 * was saved.
 *
 * Neither logo field is here. The image travels as bytes through the logo
 * endpoints, and `logo_url` is read-only — sending either through the JSON body
 * would be a second, competing way to set the same thing.
 */
export const profileBody = (form) => {
  const text = (value) => {
    const trimmed = String(value ?? "").trim();
    return trimmed === "" ? null : trimmed;
  };

  return {
    address_line: text(form.address_line),
    contact_number: text(form.contact_number),
    receipt_footer: text(form.receipt_footer),
    receipt_paper_width_mm: Number(form.receipt_paper_width_mm) || 58,
    invoice_prefix: text(form.invoice_prefix),
  };
};

/**
 * Form state as the shape the receipt renderer reads.
 *
 * The preview and the printer take the same object, so this is what keeps a
 * half-edited form renderable by the very code that will print it.
 */
export const profilePreview = (form, name) => ({
  name,
  address_line: form.address_line,
  contact_number: form.contact_number,
  logo_url: form.logo_url,
  logo_data_url: form.logo_data_url,
  receipt_footer: form.receipt_footer,
  receipt_paper_width_mm: Number(form.receipt_paper_width_mm) || 58,
  invoice_prefix: form.invoice_prefix,
});
