import { Router } from "express";
import {
  getPaymentMethods,
  createPaymentMethod,
  reorderPaymentMethods,
  updatePaymentMethod,
  deletePaymentMethod,
} from "../controllers/paymentMethodsController.js";

const router = Router();

router.get("/", getPaymentMethods);
router.post("/", createPaymentMethod);
// POST, not PUT: a `PUT /reorder` would be shadowed by `PUT /:id` below and
// reach Postgres as `WHERE id = 'reorder'`, which errors on a SERIAL column.
router.post("/reorder", reorderPaymentMethods);
router.put("/:id", updatePaymentMethod);
router.delete("/:id", deletePaymentMethod);

export default router;
