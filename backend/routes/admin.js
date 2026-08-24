import { Router } from "express";

import { getAuditLog } from "../controllers/auditController.js";
import {
  listShops,
  createShop,
  updateShop,
  setShopActive,
} from "../controllers/adminShopsController.js";
import {
  listUsers,
  createUser,
  updateUser,
  setUserActive,
  resetPassword,
  setUserShops,
  deleteUser,
} from "../controllers/adminUsersController.js";
import { correctSaleDates } from "../controllers/adminSalesController.js";
import {
  getShopLogo,
  uploadShopLogo,
  deleteShopLogo,
} from "../controllers/shopProfileController.js";
import { rawImage } from "../utils/shopLogo.js";
import { requireRealAuth, requireRole } from "../middleware/auth.js";

const router = Router();

/**
 * The guards go on the ROUTER here, which is the opposite of what every other
 * route file in this codebase does — and it is correct exactly because of what
 * makes it different: every route under /api/admin is super-admin-only, without
 * exception, now and in ticket 06. There is no /api/admin equivalent of
 * "GET /inventory is the till's catalog but POST is manager-and-up", so the
 * unit the guard applies to really is the router.
 *
 * A route added below inherits both guards by default. That is the safe
 * direction to fail in: forgetting a guard here means a route is over-protected
 * rather than open.
 *
 * requireRealAuth, not requireAuth. The legacy bypass hands out the *manager*
 * role, so it could never satisfy requireRole("super_admin") anyway — but a
 * super-admin surface must never be reachable through a compatibility flag, and
 * pinning the strict guard removes the question instead of answering it.
 *
 * Note there is no resolveShop. A super admin acts across shops here, and every
 * route below takes its subject as an ordinary path or body parameter — a shop
 * id, a user id, a sale id. That is the documented exception to ticket 04's
 * rule, and it holds only because of the two guards on the line below: the
 * parameter selects among things this caller already reaches, so it widens
 * nobody's access. Adding a manager-reachable route here would break that
 * reasoning; put such a route on a shop-scoped path with resolveShop instead.
 */
router.use(requireRealAuth, requireRole("super_admin"));

router.get("/audit", getAuditLog);

// ── Shops ──
// No DELETE, and there must not be one: sales, inventory, services, payment
// methods and audit rows all reference shops(id).
router.get("/shops", listShops);
router.post("/shops", createShop);
router.put("/shops/:id", updateShop);
router.post("/shops/:id/deactivate", setShopActive(false));
router.post("/shops/:id/reactivate", setShopActive(true));

// The receipt logo, shared with the shop-scoped mount at /api/shop-profile/logo.
// The same three handlers serve both: there they take the shop from resolveShop,
// here from the path, which is the ordinary-parameter pattern every route in this
// file already uses.
//
// GET is logo-only rather than a whole row because the list above deliberately
// carries `has_logo` instead of the image — a console showing ten shops must not
// fetch ten images to render ten cards.
router.get("/shops/:id/logo", getShopLogo);
router.post("/shops/:id/logo", rawImage, uploadShopLogo);
router.delete("/shops/:id/logo", deleteShopLogo);

// ── Users ──
router.get("/users", listUsers);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.put("/users/:id/shops", setUserShops);
router.post("/users/:id/deactivate", setUserActive(false));
router.post("/users/:id/reactivate", setUserActive(true));
router.post("/users/:id/reset-password", resetPassword);
// The hard delete. Refused for any account that has ever acted — deactivation is
// the normal path, and it is what preserves the audit trail's attribution.
router.delete("/users/:id", deleteUser);

// ── Sales ──
// :table is validated against an allowlist of exactly "open" and "closed" inside
// the handler, and is only ever used to choose between two hand-written queries.
router.patch("/sales/:table/:id/dates", correctSaleDates);

export default router;
