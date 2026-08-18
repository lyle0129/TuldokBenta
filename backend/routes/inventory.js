import { Router } from "express";
import {
  getInventory,
  createOrRestockItem,
  restockItem,
  reorderInventory,
  updateItem,
  deleteItem,
} from "../controllers/inventoryController.js";

const router = Router();

router.get("/", getInventory);
router.post("/", createOrRestockItem);
// POST, not PUT: a `PUT /reorder` would be shadowed by `PUT /:id` below and
// reach Postgres as `WHERE id = 'reorder'`, which errors on a SERIAL column.
router.post("/reorder", reorderInventory);
router.post("/:id/restock", restockItem);
router.put("/:id", updateItem);
router.delete("/:id", deleteItem);

export default router;
