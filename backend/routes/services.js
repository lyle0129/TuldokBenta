import { Router } from "express";
import {
  getServices,
  createService,
  reorderServices,
  updateService,
  deleteService,
} from "../controllers/servicesController.js";

const router = Router();

router.get("/", getServices);
router.post("/", createService);
// POST, not PUT: a `PUT /reorder` would be shadowed by `PUT /:id` below and
// reach Postgres as `WHERE id = 'reorder'`, which errors on a SERIAL column.
router.post("/reorder", reorderServices);
router.put("/:id", updateService);
router.delete("/:id", deleteService);

export default router;
