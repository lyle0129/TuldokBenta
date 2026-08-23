// utils/invoiceNumber.js
// Allocation of `INV-NNNN` invoice numbers, per shop.
//
// This used to live in the browser: both sales pages derived the next number from
// MAX(existing) over the lists they had fetched. That put the client in charge of a
// value the database has a UNIQUE constraint on, so two cashiers checking out at once
// collided, and the offline page — which only ever sees its own queue — collided with
// essentially every sale on the server.
//
// From ticket 04 the series is per shop, and the prefix is a column on `shops` rather
// than a constant, so every function here takes the prefix it should work in. The
// constant survives only as the default, which is what keeps the existing callers and
// the frontend's copy of these helpers compatible.

export const INVOICE_PREFIX = "INV-";
export const INVOICE_PAD = 4;

/** 87 -> "INV-0087". Past 9999 the number simply gets longer rather than wrapping. */
export const formatInvoiceNumber = (seq, prefix = INVOICE_PREFIX) =>
  `${prefix}${String(seq).padStart(INVOICE_PAD, "0")}`;

/**
 * "INV-0087" -> 87, given prefix "INV-". Anything else -> null.
 *
 * Anything else is null, not NaN: the offline page lets the number be typed by hand,
 * and the old `parseInt(inv.replace("INV-", ""), 10)` turned "INV-abc" into NaN, which
 * then poisoned the Math.max it was feeding.
 *
 * Deliberately startsWith + a digit test rather than building a RegExp around the
 * prefix. The prefix is a shop-editable column, so interpolating it into a pattern
 * would let "INV." match "INVx" and would break outright on an unbalanced bracket —
 * a parse that silently stops matching is how a shop restarts its numbering at 1 and
 * collides with its own history.
 */
export const parseInvoiceSeq = (invoice, prefix = INVOICE_PREFIX) => {
  if (typeof invoice !== "string") return null;
  const trimmed = invoice.trim();
  if (!trimmed.startsWith(prefix)) return null;
  const digits = trimmed.slice(prefix.length);
  return /^\d+$/.test(digits) ? Number(digits) : null;
};

/**
 * The shop's prefix and its next free sequence, in one round trip.
 *
 * Both sale tables have to be read. They carry separate UNIQUE(shop_id, invoice_number)
 * constraints with nothing spanning them, so counting only open sales would happily
 * hand out a number that a paid sale already owns — which inserts fine and then breaks
 * revertSale when that sale is reopened.
 *
 * GREATEST ignores NULL in Postgres, so a shop with sales in only one table — or with
 * hand-edited numbers that never parsed into invoice_seq — still yields the right
 * answer. COALESCE turns "no sales at all" into 0, so a brand new shop starts at 1.
 *
 * One query rather than two: this is the hottest write in the app, and it also
 * guarantees the prefix and the sequence come from the same snapshot of the shop row.
 *
 * @param {import("../config/db.js").sql} sql
 * @param {number} shopId
 * @returns {Promise<{ seq: number, invoice: string, prefix: string }>}
 */
export const allocateInvoice = async (sql, shopId) => {
  const rows = await sql`
    SELECT s.invoice_prefix,
           COALESCE(GREATEST(
             (SELECT MAX(invoice_seq) FROM open_sales   WHERE shop_id = s.id),
             (SELECT MAX(invoice_seq) FROM closed_sales WHERE shop_id = s.id)
           ), 0) + 1 AS next_seq
      FROM shops s
     WHERE s.id = ${shopId}
  `;

  // resolveShop has already checked the shop exists and is active, so an empty
  // result means the row was deleted between the two — a 500 is the honest answer.
  if (rows.length === 0) {
    throw new Error(`No shop ${shopId} to allocate an invoice number for`);
  }

  const prefix = rows[0].invoice_prefix ?? INVOICE_PREFIX;
  const seq = Number(rows[0].next_seq);
  return { seq, invoice: formatInvoiceNumber(seq, prefix), prefix };
};

/** Whether `invoice` is already spoken for **within this shop**, in either sale table. */
export const isInvoiceTaken = async (sql, shopId, invoice) => {
  const rows = await sql`
    SELECT 1 FROM open_sales   WHERE shop_id = ${shopId} AND invoice_number = ${invoice}
    UNION ALL
    SELECT 1 FROM closed_sales WHERE shop_id = ${shopId} AND invoice_number = ${invoice}
    LIMIT 1
  `;
  return rows.length > 0;
};
