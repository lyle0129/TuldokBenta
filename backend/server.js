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
import job from "./config/cron.js";
import { applyMiddleware } from "./middleware/index.js";
import { initDB } from "./config/initDB.js";
import servicesRouter from "./routes/services.js";
import inventoryRouter from "./routes/inventory.js";
import openSalesRouter from "./routes/openSales.js";
import closedSalesRouter from "./routes/closedSales.js";
import paymentMethodsRouter from "./routes/paymentMethods.js";

const app = express();
const PORT = env.port;

if (env.nodeEnv === "production") job.start(); // keep-alive cron job

applyMiddleware(app);

app.get("/api/health", (_req, res) => res.status(200).json({ status: "ok" }));
app.use("/api/services", servicesRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api", openSalesRouter);
app.use("/api/closed-sales", closedSalesRouter);
app.use("/api/payment-methods", paymentMethodsRouter);

initDB().then(() => {
  app.listen(PORT, () => {
    console.log("🚀 Server running on port:", PORT);
  });
});
