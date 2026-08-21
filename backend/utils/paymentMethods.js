// utils/paymentMethods.js
// Helpers for the payment method a sale is settled with. Kept pure — the caller
// runs the lookup and passes the rows in, the same shape as assertStockAvailable
// in saleItems.js, so utils/ never reaches for the database itself.

import { badRequest } from "./saleItems.js";

/**
 * Throws 400 unless `rows` came back non-empty for an active method.
 *
 * `paid_using` is stored as a plain string, deliberately not a foreign key, so
 * this is the only thing standing between a typo (or a five-minute-stale client
 * cache still offering a method an admin just deactivated) and a sale recorded
 * against a method that doesn't exist.
 *
 * @param {Array} rows result of selecting the code from payment_methods
 *                     WHERE is_active = TRUE
 */
export const assertMethodActive = (rows) => {
  if (!rows || rows.length === 0) {
    throw badRequest("That payment method is no longer available");
  }
};
