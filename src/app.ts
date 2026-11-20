import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import servicesRouter from "./routes/services.js";

dotenv.config();

const app = express();

const rawOrigins = [
  process.env.CLIENT_URL,
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : []),
  "http://localhost:3000",
]
  .filter((origin): origin is string => Boolean(origin && origin.trim()))
  .map((origin) => origin.trim().replace(/\/+$/, ""));

const allowedOrigins = Array.from(new Set(rawOrigins));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/+$/, "");
      if (allowedOrigins.includes(normalized)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Preserve raw body for Stripe webhook signature verification
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => {
  res.json({
    success: true,
    service: "FixMate API Server",
    status: "running",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/services", servicesRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
