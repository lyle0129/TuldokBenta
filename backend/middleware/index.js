import cors from "cors";
import express from "express";

export function applyMiddleware(app) {
  app.use(
    cors({
      origin: [
        "http://localhost:5173", // local dev
        "https://pos-spincredible.vercel.app", // replace with your frontend
        "https://multipos-orpin.vercel.app",// test with temporary front end deployment
      ],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      credentials: true,
    })
  );

  app.use(express.json());
}
