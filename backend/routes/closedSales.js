import { Router } from "express";
import {
  getClosedSales,
  updateClosedSale,
  deleteClosedSale,
} from "../controllers/closedSalesController.js";

const router = Router();

// No requireRole anywhere in this file, deliberately. Workers keep full
// closed-sale access, edit and delete included — a decision recorded in the
// permission matrix in docs/specs/multipos/00-overview.md, which preserves exactly
// what the counter can do today and leans on the audit trail instead.

router.get("/", getClosedSales);
router.put("/:id", updateClosedSale);
router.delete("/:id", deleteClosedSale);

export default router;
