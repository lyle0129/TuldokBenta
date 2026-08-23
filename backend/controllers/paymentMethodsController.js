import { sql } from "../config/db.js";
import { invalidOrderedIds } from "../utils/reorder.js";
import { recordAudit, diff, ACTIONS } from "../utils/audit.js";

/**
 * Ordering used everywhere: the admin's custom order, then label for un-numbered rows.
 *
 * `usage_count` rides along so the delete dialog can warn that past sales point
 * at this method without paying for a second round trip. closed_sales has a
 * (shop_id, paid_using) index for exactly this.
 *
 * Both sides of the subquery are scoped. The inner one correlates on
 * `cs.shop_id = pm.shop_id` rather than on the shopId parameter — it is the same
 * value, but correlating against the outer row makes the statement correct by
 * construction instead of by two values happening to agree.
 */
const selectOrdered = (shopId) => sql`
  SELECT pm.*,
         (SELECT COUNT(*) FROM closed_sales cs
           WHERE cs.shop_id = pm.shop_id AND cs.paid_using = pm.code)::int
           AS usage_count
  FROM payment_methods pm
  WHERE pm.shop_id = ${shopId}
  ORDER BY pm.sort_order NULLS LAST, pm.label ASC
`;

/** Postgres unique_violation — a duplicate code is the user's problem, not a 500. */
const UNIQUE_VIOLATION = "23505";

/**
 * The stable identifier a label is filed under.
 *
 * Kept in sync with slugifyCode() on the client, which pre-fills the field; the
 * server normalises again because the code is what gets written to paid_using
 * forever and a stray space or capital there is not recoverable.
 */
const slugifyCode = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export async function getPaymentMethods(req, res) {
  try {
    // Inactive rows are returned too: reports need their labels, and the pay
    // dialog filters to active itself. One cache entry serves both.
    const methods = await selectOrdered(req.shopId);
    res.status(200).json(methods);
  } catch (error) {
    console.error("Error fetching payment methods", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function createPaymentMethod(req, res) {
  try {
    const { code, label, icon } = req.body;
    if (!label || !String(label).trim()) {
      return res.status(400).json({ message: "Label is required" });
    }

    // The code defaults to the label so the common case needs one field.
    const finalCode = slugifyCode(code || label);
    if (!finalCode) {
      return res
        .status(400)
        .json({ message: "Code must contain at least one letter or number" });
    }
    if (finalCode.length > 50) {
      return res.status(400).json({ message: "Code must be 50 characters or fewer" });
    }

    // New methods land at the bottom of the custom order rather than at a NULL
    // sort_order, which would float them to the end unpredictably.
    //
    // The subquery is scoped too, or a new shop's first method inherits another
    // shop's ordering and starts at MAX(everyone) + 1 instead of 1.
    const created = await sql`
      INSERT INTO payment_methods (shop_id, code, label, icon, sort_order)
      VALUES (
        ${req.shopId}, ${finalCode}, ${String(label).trim()}, ${icon || null},
        (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM payment_methods WHERE shop_id = ${req.shopId})
      )
      RETURNING *
    `;
    res.status(201).json({ ...created[0], usage_count: 0 });

    // After the response and unawaited — see openSalesController.createOpenSale.
    recordAudit(req, {
      action: ACTIONS.paymentMethod.create,
      entity_type: "payment_method",
      entity_id: created[0].id,
      // The code, not the label: the code is what lands in paid_using forever,
      // so it is the value that identifies this method a year from now.
      entity_label: created[0].code,
      changes: { code: created[0].code, label: created[0].label, icon: created[0].icon },
    });
  } catch (error) {
    if (error?.code === UNIQUE_VIOLATION) {
      return res
        .status(409)
        .json({ message: "A payment method with that code already exists" });
    }
    console.error("Error adding payment method", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

/**
 * Updates the display fields only.
 *
 * `code` is deliberately absent: every closed sale stores it as a bare string,
 * so changing it here would orphan them all. Edit the label instead — that is
 * what the split between the two columns exists for.
 */
export async function updatePaymentMethod(req, res) {
  try {
    const { id } = req.params;
    const { label, icon, is_active } = req.body;

    if (label !== undefined && !String(label).trim()) {
      return res.status(400).json({ message: "Label cannot be empty" });
    }

    // Read first, only so the audit row can say what the values were. The
    // UPDATE below stays the authority on whether the row exists.
    const [before] =
      await sql`SELECT * FROM payment_methods WHERE id = ${id} AND shop_id = ${req.shopId}`;

    const updated = await sql`
      UPDATE payment_methods
      SET label = COALESCE(${label !== undefined ? String(label).trim() : null}, label),
          icon = COALESCE(${icon === undefined ? null : icon}, icon),
          is_active = COALESCE(${is_active === undefined ? null : Boolean(is_active)}, is_active)
      WHERE id = ${id} AND shop_id = ${req.shopId}
      RETURNING *
    `;
    if (updated.length === 0) {
      return res.status(404).json({ message: "Payment method not found" });
    }
    res.status(200).json(updated[0]);

    recordAudit(req, {
      action: ACTIONS.paymentMethod.update,
      entity_type: "payment_method",
      entity_id: updated[0].id,
      entity_label: updated[0].code,
      changes: diff(before, updated[0], ["label", "icon", "is_active"]),
    });
  } catch (error) {
    console.error("Error updating payment method", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

// POST /api/payment-methods/reorder
/**
 * Renumbers `sort_order` to match the given list of ids, 1..N.
 *
 * All the UPDATEs go in one `sql.transaction`, since each neon-http tagged
 * template is otherwise its own auto-committed round trip and a failure
 * halfway would leave the list in an order nobody asked for.
 */
export async function reorderPaymentMethods(req, res) {
  try {
    const { orderedIds } = req.body;

    const problem = invalidOrderedIds(orderedIds);
    if (problem) return res.status(400).json({ message: problem });

    // Queries are passed unawaited on purpose — sql.transaction batches them.
    //
    // Every one of them is scoped: the ids come straight from the client, so
    // without the predicate a caller could renumber — and thereby confirm the
    // existence of — rows in another shop.
    await sql.transaction(
      orderedIds.map(
        (id, index) => sql`
          UPDATE payment_methods
          SET sort_order = ${index + 1}
          WHERE id = ${Number(id)} AND shop_id = ${req.shopId}
        `
      )
    );

    // Return the resulting list so the client can reconcile its optimistic order.
    const methods = await selectOrdered(req.shopId);
    res.status(200).json(methods);

    // One event for the whole reorder, never one per row.
    recordAudit(req, {
      action: ACTIONS.paymentMethod.reorder,
      entity_type: "payment_method",
      entity_label: `${orderedIds.length} methods`,
      changes: { orderedIds: orderedIds.map(Number) },
    });
  } catch (error) {
    console.error("Error reordering payment methods", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function deletePaymentMethod(req, res) {
  try {
    const { id } = req.params;
    // Allowed even when sales reference the code — they keep their string and
    // the reports fall back to a title-cased version of it. The client warns
    // first and offers deactivating instead.
    const deleted =
      await sql`DELETE FROM payment_methods WHERE id = ${id} AND shop_id = ${req.shopId} RETURNING *`;
    if (deleted.length === 0) {
      return res.status(404).json({ message: "Payment method not found" });
    }
    res.status(200).json({ message: "Payment method deleted successfully" });

    // Worth a row of its own: deleting a method leaves every past sale holding
    // its code as a bare string with nothing to resolve it against, so this is
    // the only remaining record of what that code meant.
    recordAudit(req, {
      action: ACTIONS.paymentMethod.delete,
      entity_type: "payment_method",
      entity_id: deleted[0].id,
      entity_label: deleted[0].code,
      changes: { code: deleted[0].code, label: deleted[0].label, icon: deleted[0].icon },
    });
  } catch (error) {
    console.error("Error deleting payment method", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
