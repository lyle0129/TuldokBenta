// controllers/adminSalesController.js
// Correcting the date a sale was encoded with. Super admin only.
//
// ── The scoping exception, stated once per admin controller ──
// Every other controller in this codebase derives its scope from req.shopId and
// never from the request; that rule is the whole of ticket 04. The /api/admin
// controllers are the documented exception: they take the subject as an ordinary
// path or body parameter and mount no resolveShop, because a super admin acting
// across shops is the entire point of the surface.
//
// That is safe only because of the guard above it — routes/admin.js applies
// requireRealAuth and requireRole("super_admin") at the ROUTER level, and a super
// admin already reaches every shop. The parameter selects among things the caller
// may already touch; it widens nobody's access.
//
// If a route is ever added under /api/admin that a *manager* can reach, this
// reasoning collapses. Do not add one. Manager-scoped shop settings belong on a
// shop-scoped route with resolveShop — ticket 09 puts them there.
// ─────────────────────────────────────────────────────────────
//
// Why this handler is transactional while taking a sale is not: a missing audit
// row for a routine sale costs a line in a log. A missing audit row for a
// backdated sale removes the only evidence that history was rewritten, which is
// the entire reason this is restricted to super admins in the first place.

import { sql } from "../config/db.js";
import { auditQuery, ACTIONS } from "../utils/audit.js";
import {
  resolveSaleType,
  planDateCorrection,
  toTimestampText,
} from "../utils/dateCorrection.js";

// PATCH /api/admin/sales/:table/:id/dates
export const correctSaleDates = async (req, res) => {
  try {
    // Closed before anything else is built. `:table` never reaches a query as a
    // value — it only ever chooses between the two hand-written branches below,
    // because a neon tagged template cannot parameterise an identifier and a
    // table name interpolated from the URL would be an injection.
    const saleType = resolveSaleType(req.params.table);
    if (!saleType) {
      return res.status(400).json({ message: "Unknown sale type" });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ message: "Sale not found" });
    }

    // No shop predicate, deliberately: Requirement 5.8 puts every shop's sales
    // in reach here, and the router-level role guard is what makes that correct.
    const [sale] =
      saleType === "open"
        ? await sql`SELECT * FROM open_sales   WHERE id = ${id}`
        : await sql`SELECT * FROM closed_sales WHERE id = ${id}`;

    if (!sale) {
      return res.status(404).json({ message: "Sale not found" });
    }

    const plan = planDateCorrection({ current: sale, patch: req.body ?? {}, saleType });
    if (plan.error) {
      // Nothing has been written at this point, which is the other half of
      // "responds 400 and changes nothing".
      return res.status(plan.error.status).json({ message: plan.error.message });
    }

    const { next, set } = plan;

    // COALESCE with a NULL parameter is how an omitted field stays untouched:
    // the column is written back to itself rather than to a value we read a
    // moment ago and would have to re-serialise correctly.
    const created = set.created_at ?? null;
    const paid = set.paid_at ?? null;

    const update =
      saleType === "open"
        ? sql`
            UPDATE open_sales
               SET created_at = COALESCE(${created}::timestamp, created_at)
             WHERE id = ${id}
             RETURNING *
          `
        : sql`
            UPDATE closed_sales
               SET created_at = COALESCE(${created}::timestamp, created_at),
                   paid_at    = COALESCE(${paid}::timestamp, paid_at)
             WHERE id = ${id}
             RETURNING *
          `;

    // The update and its record, or neither. Both queries are passed unawaited
    // so sql.transaction can batch them into one round trip — the convention
    // applyStockAndSale already relies on.
    const [rows] = await sql.transaction([
      update,
      auditQuery(req, {
        action: ACTIONS.sale.dateCorrected,
        // Explicit, because there is no resolveShop on this router: without it
        // rowFor would default shop_id to req.shopId, which is undefined here,
        // and every correction would file as a global event belonging to no shop.
        shop_id: sale.shop_id,
        entity_type: saleType === "open" ? "open_sale" : "closed_sale",
        entity_id: sale.id,
        entity_label: sale.invoice_number,
        // Complete before and after, not a diff. This row is the only trace that
        // a month's figures changed, and "created_at: 2026-03-02" means nothing
        // a year later without the value it replaced.
        changes: {
          before: {
            created_at: toTimestampText(sale.created_at),
            paid_at: toTimestampText(sale.paid_at),
          },
          after: next,
        },
      }),
    ]);

    // items, stock, invoice_number and invoice_seq are all untouched, and moving
    // a date never moves a sale between the two tables — the paid/unpaid
    // distinction is unaffected by any correction.
    res.status(200).json(rows[0]);
  } catch (error) {
    console.error("Error correcting sale dates", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
