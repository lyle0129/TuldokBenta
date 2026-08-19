// utils/filterSales.js
// Free-text matching shared by the open- and closed-sales lists.
//
// Lifted out of Reporting.jsx, which had the only search in the app. Both sale
// lists now use the same rules, so "search" means the same thing everywhere.

import { isFreebieLine } from "./buildSaleItems";

/**
 * True when `query` appears in the invoice number, the customer name, any
 * line's item or service name, or the payment method.
 *
 * Freebie lines are skipped: they're derived from a service, so matching them
 * would surface sales whose visible lines contain nothing like the query.
 */
export const matchesQuery = (sale, query) => {
  const term = query?.trim().toLowerCase();
  if (!term) return true;
  if (!sale) return false;

  if (sale.invoice_number?.toLowerCase().includes(term)) return true;
  // Older sales have no name at all, so this is a miss rather than a match —
  // which is why the optional chain matters.
  if (sale.customer_name?.toLowerCase().includes(term)) return true;
  if (sale.paid_using?.toLowerCase().includes(term)) return true;

  return (sale.items || []).some((item) => {
    if (isFreebieLine(item)) return false;
    const name = item.type === "service" ? item.service_name : item.item_name;
    return name?.toLowerCase().includes(term);
  });
};

/** Returns the input array unchanged when the query is blank. */
export const filterSales = (sales = [], query) => {
  if (!query?.trim()) return sales;
  return sales.filter((sale) => matchesQuery(sale, query));
};
