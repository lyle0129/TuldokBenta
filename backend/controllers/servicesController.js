import { sql } from "../config/db.js";
import { invalidOrderedIds } from "../utils/reorder.js";

/** Ordering used everywhere: the admin's custom order, then name for un-numbered rows. */
const selectOrdered = () =>
  sql`SELECT * FROM services ORDER BY sort_order NULLS LAST, service_name ASC`;

export async function getServices(req, res) {
  try {
    const services = await selectOrdered();
    res.status(200).json(services);
  } catch (error) {
    console.error("Error fetching services", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function createService(req, res) {
  try {
    const { service_name, price, freebies } = req.body;
    if (!service_name || price === undefined) {
      return res.status(400).json({ message: "Service name and price are required" });
    }

    // New services land at the bottom of the custom order rather than at a NULL
    // sort_order, which would float them to the end unpredictably.
    const service = await sql`
      INSERT INTO services (service_name, price, freebies, sort_order)
      VALUES (
        ${service_name}, ${price}, ${JSON.stringify(freebies || [])},
        (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM services)
      )
      RETURNING *
    `;
    res.status(201).json(service[0]);
  } catch (error) {
    console.error("Error adding service", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function updateService(req, res) {
  try {
    const { id } = req.params;
    const { service_name, price, freebies } = req.body;
    const updated = await sql`
      UPDATE services
      SET service_name = COALESCE(${service_name}, service_name),
          price = COALESCE(${price}, price),
          freebies = COALESCE(${freebies !== undefined ? JSON.stringify(freebies) : null}, freebies)
      WHERE id = ${id}
      RETURNING *
    `;
    if (updated.length === 0) return res.status(404).json({ message: "Service not found" });
    res.status(200).json(updated[0]);
  } catch (error) {
    console.error("Error updating service", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

// POST /api/services/reorder
/**
 * Renumbers `sort_order` to match the given list of ids, 1..N.
 *
 * All the UPDATEs go in one `sql.transaction`, since each neon-http tagged
 * template is otherwise its own auto-committed round trip and a failure
 * halfway would leave the catalog in an order nobody asked for.
 */
export async function reorderServices(req, res) {
  try {
    const { orderedIds } = req.body;

    const problem = invalidOrderedIds(orderedIds);
    if (problem) return res.status(400).json({ message: problem });

    // Queries are passed unawaited on purpose — sql.transaction batches them.
    await sql.transaction(
      orderedIds.map(
        (id, index) => sql`
          UPDATE services
          SET sort_order = ${index + 1}
          WHERE id = ${Number(id)}
        `
      )
    );

    // Return the resulting list so the client can reconcile its optimistic order.
    const services = await selectOrdered();
    res.status(200).json(services);
  } catch (error) {
    console.error("Error reordering services", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function deleteService(req, res) {
  try {
    const { id } = req.params;
    const deleted = await sql`DELETE FROM services WHERE id = ${id} RETURNING *`;
    if (deleted.length === 0) return res.status(404).json({ message: "Service not found" });
    res.status(200).json({ message: "Service deleted successfully" });
  } catch (error) {
    console.error("Error deleting service", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
