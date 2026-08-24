// First, and before any other import: ES module imports are evaluated before a
// module's own statements, so pinning the zone here rather than in a top-level
// assignment is what guarantees it happens before the DB driver loads.
import "./config/timezone.js";

// A side-effect import for the same reason as the line above: a `dotenv.config()`
// call here would be a statement, and statements run only after every import in
// this file has already been evaluated — including config/env.js, which would
// then validate against an environment .env had not been read into yet.
import "dotenv/config";

// Then env.js, which validates as it is evaluated. Keeping it above the routers
// means a missing secret is reported before initDB touches the schema.
import { env } from "./config/env.js";

import express from "express";
import job, { auditRetentionJob } from "./config/cron.js";
import { applyMiddleware } from "./middleware/index.js";
import { requireAuth } from "./middleware/auth.js";
import { resolveShop } from "./middleware/shopScope.js";
import { initDB } from "./config/initDB.js";
import servicesRouter from "./routes/services.js";
import inventoryRouter from "./routes/inventory.js";
import openSalesRouter from "./routes/openSales.js";
import closedSalesRouter from "./routes/closedSales.js";
import paymentMethodsRouter from "./routes/paymentMethods.js";
import shopProfileRouter from "./routes/shopProfile.js";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";

const app = express();
const PORT = env.port;

// One proxy hop, because the login rate limiter buckets by req.ip and a hosted
// deploy puts a load balancer in front of us — without this, every request
// arrives wearing the balancer's address and the whole shop shares one attempt
// budget. Deliberately `1` rather than `true`: trusting the entire chain would
// let anyone set their own X-Forwarded-For and hop to a fresh bucket per guess,
// which is worse than not rate limiting at all.
app.set("trust proxy", 1);

if (env.nodeEnv === "production") {
  job.start(); // keep-alive cron job

  // Null unless AUDIT_RETENTION_DAYS is set. Announced on start because a job
  // that silently deletes rows is one nobody remembers configuring.
  if (auditRetentionJob) {
    auditRetentionJob.start();
    console.log(
      `🧹 Audit retention sweep enabled: events older than ${env.auditRetentionDays} days ` +
        "are removed daily at 03:00."
    );
  }
}

applyMiddleware(app);

if (env.legacyUnauth) {
  // Loud on purpose. This flag means an unauthenticated request is served as a
  // manager, which is correct exactly once — during the deploy window in which
  // the new backend is live and the old frontend still is too. Left on
  // afterwards it is a wide-open API, and the only place anyone would notice is
  // this line in the deploy log.
  console.warn(
    "\n⚠️  LEGACY_UNAUTH=true — requests with no token are served as a manager " +
      `on shop ${env.legacyShopId}.\n` +
      "    This is the ticket-12 cutover window only. Turn it off once the " +
      "authenticated frontend is deployed.\n"
  );
}

// Public on purpose: config/cron.js pings this every 14 minutes to keep the host
// awake, and it has no token to send. Registered before everything below so it is
// never reached by the guards.
app.get("/api/health", (_req, res) => res.status(200).json({ status: "ok" }));

// The auth routes are their own gate — login and refresh cannot require a token,
// and the rest mount requireRealAuth themselves, with no legacy bypass.
app.use("/api/auth", authRouter);

// Also its own gate, and for the same reason: it carries requireRealAuth and
// requireRole("super_admin") at the router level, and deliberately no
// resolveShop — a super admin acts across shops here rather than within one.
// Ticket 06 extends this same router; there is never a second /api/admin mount.
app.use("/api/admin", adminRouter);

// Everything past this point is authenticated and scoped to one shop. requireAuth
// and resolveShop go on the router rather than the route because every route in
// each of these needs both; the role guards, which differ within a router, live
// per route inside the route files.
app.use("/api/services", requireAuth, resolveShop, servicesRouter);
app.use("/api/inventory", requireAuth, resolveShop, inventoryRouter);
app.use("/api/closed-sales", requireAuth, resolveShop, closedSalesRouter);
app.use("/api/payment-methods", requireAuth, resolveShop, paymentMethodsRouter);
// A manager edits their own shop's receipt here rather than under /api/admin.
// That router takes a shop id as an ordinary parameter, which is safe only
// because every caller reaching it already reaches every shop — so a
// manager-reachable route there would break the reasoning. Here the shop comes
// from resolveShop and a manager cannot name one they are not assigned to.
app.use("/api/shop-profile", requireAuth, resolveShop, shopProfileRouter);

// Last of the six. Its paths (/open-sales, /pay-sale/:id, …) are not under a
// prefix of their own, so it has to mount on bare /api — which matches every
// request the five specific mounts above also match. Registered ahead of them it
// would run requireAuth and resolveShop on those requests too, fall through
// unmatched, and make them resolve their scope twice; resolveShop's super-admin
// branch is a database query, so that is a real second round trip per request.
// Mounting it last also means an unknown /api/... path gets a 401 rather than
// silently reaching nothing.
app.use("/api", requireAuth, resolveShop, openSalesRouter);

initDB().then(() => {
  app.listen(PORT, () => {
    console.log("🚀 Server running on port:", PORT);
  });
});
