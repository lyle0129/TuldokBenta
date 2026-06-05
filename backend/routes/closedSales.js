import { Router } from "express";
import { getClosedSales, deleteClosedSale } from "../controllers/closedSalesController.js";

const router = Router();

router.get("/", getClosedSales);
router.delete("/:id", deleteClosedSale);

export default router;
