import { Router } from "express";
import {
  getOpenSales,
  createOpenSale,
  updateOpenSale,
  deleteOpenSale,
  paySale,
  revertSale,
} from "../controllers/openSalesController.js";

const router = Router();

router.get("/open-sales", getOpenSales);
router.post("/open-sales", createOpenSale);
router.put("/open-sales/:id", updateOpenSale);
router.delete("/open-sales/:id", deleteOpenSale);
router.post("/pay-sale/:id", paySale);
router.post("/revert-sale/:id", revertSale);

export default router;
