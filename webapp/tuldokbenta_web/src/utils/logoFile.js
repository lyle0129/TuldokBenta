// utils/logoFile.js
//
// What counts as an acceptable receipt logo. Must match
// backend/utils/shopLogo.js — the server refuses anything else, and checking
// here as well is what turns a wasted upload and a 413 into an immediate
// sentence under the field.

/**
 * No SVG, and that is a security decision rather than a compatibility one. The
 * logo is embedded as a data URI into a receipt document built by string
 * concatenation, where an SVG would run its own script.
 */
export const ALLOWED_LOGO_MIME = ["image/png", "image/jpeg", "image/webp"];

/**
 * 512 KB, which is ~700 KB once base64 inflates it by a third.
 *
 * The ceiling is set by localStorage rather than by the database: a till holds
 * the profile twice — in the persisted query cache and in the offline catalog
 * snapshot — against a quota of about 5 MB. A logo printed at 58 mm wide has no
 * use for more than this anyway.
 */
export const MAX_LOGO_BYTES = 512 * 1024;

export const formatKb = (bytes) => `${Math.round(bytes / 1024)} KB`;

/**
 * Reads a picked file into the data URI the receipt will actually print.
 *
 * The same encoding the server would send back, produced locally so a preview
 * updates the instant a file is chosen rather than after a save and a refetch.
 */
export const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });

/** The reason a picked file is unacceptable, or null when it is fine. */
export const logoRejection = (file) => {
  if (!ALLOWED_LOGO_MIME.includes(file.type)) {
    return "Logos must be a PNG, JPEG or WebP image.";
  }

  if (file.size > MAX_LOGO_BYTES) {
    return (
      `That image is ${formatKb(file.size)}. The limit is ${formatKb(MAX_LOGO_BYTES)} — ` +
      "a receipt prints it about 50 mm wide, so a small one is plenty."
    );
  }

  return null;
};
