import { Router } from "express";

import { getAuditLog } from "../controllers/auditController.js";
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
 * Note there is no resolveShop. A super admin acts across shops here, and the
 * audit read takes an optional shop_id *filter* — which is a filter, not a
 * scope, and is the one place in the backend where a shop id legitimately comes
 * from the query string.
 */
router.use(requireRealAuth, requireRole("super_admin"));

router.get("/audit", getAuditLog);

export default router;
