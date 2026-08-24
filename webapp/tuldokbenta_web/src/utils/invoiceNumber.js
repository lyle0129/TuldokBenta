// utils/invoiceNumber.js
// Reading and writing `INV-NNNN`, mirroring backend/utils/invoiceNumber.js.
//
// The server allocates the real number now. What's left on the client is the offline
// page's placeholder: a queued sale needs *something* on its receipt before it can be
// synced, so the page keeps counting locally and the server corrects it on the way in.
//
// The prefix is a column on `shops`, not a constant, so each function takes the one it
// should work in — mirroring backend/utils/invoiceNumber.js, which these have to agree
// with for a queued number to parse into the same invoice_seq on arrival. The constant
// survives as the default, which is what a device with no cached shop profile falls
// back to: a receipt with a default prefix beats no receipt.

export const INVOICE_PREFIX = "INV-";
export const INVOICE_PAD = 4;

/** 87 -> "INV-0087". Past 9999 the number gets longer rather than wrapping. */
export const formatInvoiceNumber = (seq, prefix = INVOICE_PREFIX) =>
  `${prefix}${String(seq).padStart(INVOICE_PAD, "0")}`;

/**
 * "INV-0087" -> 87, given prefix "INV-". Anything else -> null.
 *
 * Null rather than NaN is the whole point. Both pages used to do
 * `parseInt(inv.replace("INV-", ""), 10)`, so a hand-typed "INV-abc" became NaN and
 * went straight into `Math.max(...)`, making the next invoice number NaN too.
 *
 * Deliberately startsWith + a digit test rather than building a RegExp around the
 * prefix, exactly as the backend does. The prefix is a shop-editable column, so
 * interpolating it into a pattern would let "INV." match "INVx" and would break
 * outright on an unbalanced bracket — a parse that silently stops matching is how a
 * shop restarts its numbering at 1 and collides with its own history.
 */
export const parseInvoiceSeq = (invoice, prefix = INVOICE_PREFIX) => {
  if (typeof invoice !== "string") return null;
  const trimmed = invoice.trim();
  if (!trimmed.startsWith(prefix)) return null;
  const digits = trimmed.slice(prefix.length);
  return /^\d+$/.test(digits) ? Number(digits) : null;
};

/** The highest sequence among `invoices`, ignoring unparseable ones. 0 if none parse. */
export const maxInvoiceSeq = (invoices = [], prefix = INVOICE_PREFIX) =>
  invoices.reduce((max, invoice) => {
    const seq = parseInvoiceSeq(invoice, prefix);
    return seq !== null && seq > max ? seq : max;
  }, 0);
