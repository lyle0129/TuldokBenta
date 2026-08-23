import { Router } from "express";
import {
  getOpenSales,
  getNextInvoice,
  createOpenSale,
  updateOpenSale,
  deleteOpenSale,
  paySale,
  revertSale,
} from "../controllers/openSalesController.js";

const router = Router();

// No requireRole anywhere in this file, deliberately. Every route here is open to
// all three roles — running the till is the worker's whole job, and that includes
// paying and reverting. See the permission matrix in docs/specs/multipos/00-overview.md,
// which records this as a decision with the audit trail as the compensating control.

router.get("/open-sales", getOpenSales);
// Its own path rather than /open-sales/next-invoice: the number spans both sale
// tables, so it isn't a sub-resource of the open ones.
router.get("/next-invoice", getNextInvoice);
router.post("/open-sales", createOpenSale);
router.put("/open-sales/:id", updateOpenSale);
router.delete("/open-sales/:id", deleteOpenSale);
router.post("/pay-sale/:id", paySale);
router.post("/revert-sale/:id", revertSale);

export default router;
