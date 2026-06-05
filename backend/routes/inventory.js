import { Router } from "express";
import {
  getInventory,
  createOrRestockItem,
  updateItem,
  deleteItem,
} from "../controllers/inventoryController.js";

const router = Router();

router.get("/", getInventory);
router.post("/", createOrRestockItem);
router.put("/:id", updateItem);
router.delete("/:id", deleteItem);

export default router;
