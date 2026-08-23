// middleware/auth.js
// Who is asking, resolved once, before any controller runs.
//
// Nothing here reads the database. Everything a request needs to be authorised
// — id, username, role, shop list — is already inside the access token, which
// is what keeps the till's hot path at the one query the controller itself
// makes. The cost is that a change to someone's role or assignments does not
// reach them until their token is refreshed; see utils/tokens.js.
//
// These are mounted on nothing but /api/auth in this ticket. Ticket 04 is what
// puts them in front of the existing routes.

import { env } from "../config/env.js";
import { verifyAccessToken } from "../utils/tokens.js";

/**
 * The strict guard. Verifies the bearer token or answers 401 — no bypass, ever.
 *
 * This is what every /api/auth route mounts, and what ticket 06's super-admin
 * routes will mount, for two reasons. The synthetic legacy actor below has
 * `id: null`, so /me would have no row to return and /change-password no row to
 * update. And a super-admin route must never be reachable through a bypass, so
 * pinning it to this guard removes the question rather than answering it.
 */
export const requireRealAuth = (req, res, next) => {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token && verifyAccessToken(token);

  if (!payload) {
    return res.status(401).json({ message: "Sign in to continue" });
  }

  // Read field by field rather than spread: the token is attacker-supplied
  // input once it has been verified as *ours*, and a claim we did not put there
  // has no business landing on req.user.
  req.user = {
    id: payload.sub,
    username: payload.username,
    role: payload.role,
    shops: payload.shops ?? [],
  };

  next();
};

/**
 * The same guard, plus the compatibility window.
 *
 * Mounted by the pre-existing till and admin routes in ticket 04 so that the
 * old frontend — which sends no token at all — keeps working while the new one
 * is being deployed.
 */
export const requireAuth = (req, res, next) => {
  // ── Removed in ticket 12, together with the LEGACY_UNAUTH flag itself. ──
  //
  // The condition is guarded on the header being ABSENT, and that is the single
  // most security-sensitive line in this ticket. Written the other way round —
  // `if (env.legacyUnauth && !payload)` — every malformed, expired or forged
  // token would fall through to a manager session, and anyone could escalate to
  // manager by deliberately sending a broken token. Absent means "the old
  // frontend is calling"; invalid means "no".
  if (!req.header("authorization") && env.legacyUnauth) {
    req.user = {
      id: null,
      username: "legacy",
      role: "manager",
      shops: [env.legacyShopId],
      legacy: true, // resolveShop keys its own fallback off this
    };
    return next();
  }
  // ── End of the block removed in ticket 12. ──

  return requireRealAuth(req, res, next);
};

/**
 * Role gate. Attached per route, never to a whole router.
 *
 * GET /api/inventory is worker-accessible because the till renders its catalog
 * from it, while POST/PUT/DELETE on the same path are manager-and-up — so the
 * unit this can be applied to is the route, not the router.
 */
export const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user?.role)
      ? next()
      : res.status(403).json({ message: "You do not have access to this action" });
