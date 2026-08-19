import { Router } from "express";
import {
  getClosedSales,
  updateClosedSale,
  deleteClosedSale,
} from "../controllers/closedSalesController.js";

const router = Router();

router.get("/", getClosedSales);
router.put("/:id", updateClosedSale);
router.delete("/:id", deleteClosedSale);

export default router;
