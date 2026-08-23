import { Router } from "express";
import {
  getInventory,
  createOrRestockItem,
  restockItem,
  reorderInventory,
  updateItem,
  deleteItem,
} from "../controllers/inventoryController.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

// The guard is per route, never on the router. GET is the till's catalog and has
// to stay reachable by a worker, while every write beside it is manager-and-up —
// so the unit it can be applied to is the route.
const managerUp = requireRole("manager", "super_admin");

router.get("/", getInventory);
router.post("/", managerUp, createOrRestockItem);
// POST, not PUT: a `PUT /reorder` would be shadowed by `PUT /:id` below and
// reach Postgres as `WHERE id = 'reorder'`, which errors on a SERIAL column.
router.post("/reorder", managerUp, reorderInventory);
router.post("/:id/restock", managerUp, restockItem);
router.put("/:id", managerUp, updateItem);
router.delete("/:id", managerUp, deleteItem);

export default router;
