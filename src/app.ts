import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import servicesRouter from "./routes/services.js";
import bookingsRouter from "./routes/bookings.js";
import paymentsRouter from "./routes/payments.js";
import usersRouter from "./routes/users.js";
import adminRouter from "./routes/admin.js";

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

// Ensure MongoDB is connected in serverless environments (e.g. Vercel)
app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
});

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
app.use("/api/bookings", bookingsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/users", usersRouter);
app.use("/api/admin", adminRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
