import { Router } from "express";
import {
  getServices,
  createService,
  reorderServices,
  updateService,
  deleteService,
} from "../controllers/servicesController.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

// Per route, not on the router: GET is part of the till's catalog and has to
// stay reachable by a worker. See routes/inventory.js.
const managerUp = requireRole("manager", "super_admin");

router.get("/", getServices);
router.post("/", managerUp, createService);
// POST, not PUT: a `PUT /reorder` would be shadowed by `PUT /:id` below and
// reach Postgres as `WHERE id = 'reorder'`, which errors on a SERIAL column.
router.post("/reorder", managerUp, reorderServices);
router.put("/:id", managerUp, updateService);
router.delete("/:id", managerUp, deleteService);

export default router;
