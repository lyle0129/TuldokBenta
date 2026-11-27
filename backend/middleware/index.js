import cors from "cors";
import express from "express";

export function applyMiddleware(app) {
  app.use(
    cors({
      // Reflect the request origin so any frontend origin is allowed while
      // still supporting `credentials: true` (browsers reject `*` with credentials).
      origin: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    })
  );

  app.use(express.json());
}
