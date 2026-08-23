import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  login,
  refresh,
  me,
  logout,
  changePassword,
} from "../controllers/authController.js";
import { requireRealAuth } from "../middleware/auth.js";

/**
 * Applied to the two endpoints that take a credential, and nowhere else.
 *
 * Deliberately not in applyMiddleware: the till's endpoints are hit constantly
 * by a handful of terminals and must keep being served at full speed. A public
 * endpoint with a password on it is a free brute-force target; a sales list is
 * not.
 *
 * 20 attempts per IP per fifteen minutes is far above anything a real shop
 * does — a shift change is a handful of logins — and far below a useful
 * guessing rate. `skipSuccessfulRequests` means only *failures* count, so a
 * busy legitimate terminal can never trip it no matter how often it signs in.
 */
const attemptLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20, // `max` in express-rate-limit v6 and earlier
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many attempts. Try again shortly." },
  });

const router = Router();

// A limiter each, not one shared between them, and the whole shop is very
// likely behind a single public IP. Sharing one bucket would mean a tab looping
// on a refresh token that has been invalidated — which answers 401 every time,
// and which the client retries without anyone watching — could spend the budget
// that signing in needs, and lock the counter out for fifteen minutes. Two
// buckets keep a broken session from becoming a shop-wide outage.
router.post("/login", attemptLimiter(), login);
router.post("/refresh", attemptLimiter(), refresh);

// requireRealAuth, never requireAuth: these three need a real actor with a real
// row behind it. The legacy bypass produces a synthetic actor with `id: null`,
// which would leave /me with nothing to return and /change-password with
// nothing to update. The legacy contract covers the endpoints the pre-auth
// frontend calls, and it never called these.
router.get("/me", requireRealAuth, me);
router.post("/logout", requireRealAuth, logout);
router.post("/change-password", requireRealAuth, changePassword);

export default router;
