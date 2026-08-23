import { Router } from "express";
import {
  getPaymentMethods,
  createPaymentMethod,
  reorderPaymentMethods,
  updatePaymentMethod,
  deletePaymentMethod,
} from "../controllers/paymentMethodsController.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

// Per route, not on the router: the pay dialog reads this list, so GET has to
// stay reachable by a worker. See routes/inventory.js.
const managerUp = requireRole("manager", "super_admin");

router.get("/", getPaymentMethods);
router.post("/", managerUp, createPaymentMethod);
// POST, not PUT: a `PUT /reorder` would be shadowed by `PUT /:id` below and
// reach Postgres as `WHERE id = 'reorder'`, which errors on a SERIAL column.
router.post("/reorder", managerUp, reorderPaymentMethods);
router.put("/:id", managerUp, updatePaymentMethod);
router.delete("/:id", managerUp, deletePaymentMethod);

export default router;
