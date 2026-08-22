// utils/invoiceNumber.js
// Reading and writing `INV-NNNN`, mirroring backend/utils/invoiceNumber.js.
//
// The server allocates the real number now. What's left on the client is the offline
// page's placeholder: a queued sale needs *something* on its receipt before it can be
// synced, so the page keeps counting locally and the server corrects it on the way in.

export const INVOICE_PREFIX = "INV-";
export const INVOICE_PAD = 4;

/** 87 -> "INV-0087". Past 9999 the number gets longer rather than wrapping. */
export const formatInvoiceNumber = (seq) =>
  `${INVOICE_PREFIX}${String(seq).padStart(INVOICE_PAD, "0")}`;

/**
 * "INV-0087" -> 87, and null for anything else.
 *
 * Null rather than NaN is the whole point. Both pages used to do
 * `parseInt(inv.replace("INV-", ""), 10)`, so a hand-typed "INV-abc" became NaN and
 * went straight into `Math.max(...)`, making the next invoice number NaN too.
 */
export const parseInvoiceSeq = (invoice) => {
  if (typeof invoice !== "string") return null;
  const match = /^INV-(\d+)$/.exec(invoice.trim());
  return match ? Number(match[1]) : null;
};

/** The highest sequence among `invoices`, ignoring unparseable ones. 0 if none parse. */
export const maxInvoiceSeq = (invoices = []) =>
  invoices.reduce((max, invoice) => {
    const seq = parseInvoiceSeq(invoice);
    return seq !== null && seq > max ? seq : max;
  }, 0);
