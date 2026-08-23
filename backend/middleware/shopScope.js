// middleware/shopScope.js
// Which shop a request acts on.
//
// The rule ticket 04 is built on: `req.shopId` set here is the ONLY value a
// controller may scope a query by. Never the body, never the query string —
// both are things the client chooses, and a shop id read from either is a
// request to read another shop's sales.

import { sql } from "../config/db.js";
import { env } from "../config/env.js";

/**
 * Builds the middleware around a `sql` tag.
 *
 * Taking `sql` as a parameter rather than closing over the import is the same
 * shape utils/invoiceNumber.js already uses, and it is what lets the
 * super-admin branch below — the one branch that touches the database — be
 * unit-tested without one. Ticket 04 imports `resolveShop`, not this.
 */
export const makeResolveShop = (sql) => async (req, res, next) => {
  const raw = req.header("x-shop-id");

  // ── Removed in ticket 12, together with the LEGACY_UNAUTH flag itself. ──
  //
  // Narrower than requireAuth's bypass on purpose: it fires only for the
  // synthetic legacy actor, so a genuinely authenticated request that simply
  // forgot its X-Shop-Id header still gets the 400 below rather than silently
  // acting on shop 1.
  if (!raw && env.legacyUnauth && req.user?.legacy) {
    req.shopId = env.legacyShopId;
    return next();
  }
  // ── End of the block removed in ticket 12. ──

  const shopId = Number(raw);
  if (!Number.isInteger(shopId) || shopId <= 0) {
    return res.status(400).json({ message: "No shop selected" });
  }

  if (req.user?.role === "super_admin") {
    // Checked against the table rather than against the token, because a super
    // admin's access is "every active shop" — a set that grows the moment one
    // is created. Read from the token it would be stale for up to an hour, and
    // a super admin would have to sign out and back in to open a shop they had
    // just made. One extra query, paid only by the people not running the till.
    const rows = await sql`
      SELECT 1 FROM shops WHERE id = ${shopId} AND is_active = TRUE
    `;
    if (rows.length === 0) {
      return res.status(403).json({ message: "Shop not found" });
    }
  } else if (!req.user?.shops?.includes(shopId)) {
    return res.status(403).json({ message: "You are not assigned to that shop" });
  }

  req.shopId = shopId;
  next();
};

export const resolveShop = makeResolveShop(sql);
