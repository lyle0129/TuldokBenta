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
