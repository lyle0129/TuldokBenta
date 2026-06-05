import { sql } from "../config/db.js";

export async function getServices(req, res) {
  try {
    const services = await sql`SELECT * FROM services ORDER BY service_name ASC`;
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

    const service = await sql`
      INSERT INTO services (service_name, price, freebies)
      VALUES (${service_name}, ${price}, ${JSON.stringify(freebies || [])})
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
