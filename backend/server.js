import dotenv from "dotenv";
dotenv.config();

import express from "express";
import job from "./config/cron.js";
import { applyMiddleware } from "./middleware/index.js";
import { initDB } from "./config/initDB.js";
import servicesRouter from "./routes/services.js";
import inventoryRouter from "./routes/inventory.js";
import openSalesRouter from "./routes/openSales.js";
import closedSalesRouter from "./routes/closedSales.js";

const app = express();
const PORT = process.env.PORT || 5001;

if (process.env.NODE_ENV === "production") job.start(); // keep-alive cron job

applyMiddleware(app);

app.get("/api/health", (_req, res) => res.status(200).json({ status: "ok" }));
app.use("/api/services", servicesRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api", openSalesRouter);
app.use("/api/closed-sales", closedSalesRouter);

initDB().then(() => {
  app.listen(PORT, () => {
    console.log("🚀 Server running on port:", PORT);
  });
});
