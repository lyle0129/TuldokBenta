// utils/invoiceNumber.js
// Allocation of `INV-NNNN` invoice numbers.
//
// This used to live in the browser: both sales pages derived the next number from
// MAX(existing) over the lists they had fetched. That put the client in charge of a
// value the database has a UNIQUE constraint on, so two cashiers checking out at once
// collided, and the offline page — which only ever sees its own queue — collided with
// essentially every sale on the server.

export const INVOICE_PREFIX = "INV-";
export const INVOICE_PAD = 4;

/** 87 -> "INV-0087". Past 9999 the number simply gets longer rather than wrapping. */
export const formatInvoiceNumber = (seq) =>
  `${INVOICE_PREFIX}${String(seq).padStart(INVOICE_PAD, "0")}`;

/**
 * "INV-0087" -> 87.
 *
 * Anything else is null, not NaN: the offline page lets the number be typed by hand,
 * and the old `parseInt(inv.replace("INV-", ""), 10)` turned "INV-abc" into NaN, which
 * then poisoned the Math.max it was feeding.
 */
export const parseInvoiceSeq = (invoice) => {
  if (typeof invoice !== "string") return null;
  const match = /^INV-(\d+)$/.exec(invoice.trim());
  return match ? Number(match[1]) : null;
};

/**
 * The highest sequence in use across *both* sale tables.
 *
 * Both tables have to be read. They carry separate UNIQUE(invoice_number) constraints
 * with nothing spanning them, so counting only open sales would happily hand out a
 * number that a paid sale already owns — which inserts fine and then breaks
 * revertSale when that sale is reopened.
 *
 * `substring(... from regex)` yields NULL for a value that doesn't fit the format and
 * MAX ignores NULL, so a hand-edited oddity is skipped instead of failing the cast.
 *
 * @param {import("../config/db.js").sql} sql
 * @returns {Promise<number>} 0 when there are no sales yet
 */
export const highestInvoiceSeq = async (sql) => {
  const rows = await sql`
    SELECT COALESCE(MAX(seq), 0) AS seq FROM (
      SELECT (substring(invoice_number from '^INV-([0-9]+)$'))::int AS seq FROM open_sales
      UNION ALL
      SELECT (substring(invoice_number from '^INV-([0-9]+)$'))::int AS seq FROM closed_sales
    ) t
  `;
  return Number(rows[0]?.seq ?? 0);
};

/** Whether `invoice` is already spoken for, in either sale table. */
export const isInvoiceTaken = async (sql, invoice) => {
  const rows = await sql`
    SELECT 1 FROM open_sales WHERE invoice_number = ${invoice}
    UNION ALL
    SELECT 1 FROM closed_sales WHERE invoice_number = ${invoice}
    LIMIT 1
  `;
  return rows.length > 0;
};
