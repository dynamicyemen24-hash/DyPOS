import express from "express";
import { cors } from "cors";
import { expressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./trpc";
import { createContext } from "./context";
import { rateLimitMiddleware } from "./rateLimit";
import { ENV } from "./env";
import { warmDatabase } from "./db";
import helmet from "helmet";
import { securityHeaders } from "./security";

const app = express();

app.use(helmet());
app.use(cors({ origin: ENV.corsOrigin, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  securityHeaders().forEach(m => m(req, res, next));
});

app.use(rateLimitMiddleware(ENV.rateLimitMax, ENV.rateLimitWindowMs));

app.use("/api/trpc", expressMiddleware(appRouter, { createContext }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), version: "1.16.0" });
});

app.get("/api/health/readiness", (_req, res) => {
  res.json({ ready: true });
});

app.get("/api/health/liveness", (_req, res) => {
  res.json({ alive: true });
});

warmDatabase();

export { app };
