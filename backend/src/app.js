import cors from "cors";
import express from "express";
import { config } from "./config.js";
import analysisRoutes from "./routes/analysisRoutes.js";

export function createApp() {
  const app = express();

  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const ok =
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        origin === config.clientOrigin;
      ok ? cb(null, true) : cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  }));

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_, res) => res.json({ ok: true, version: "2.0" }));

  app.use("/api", analysisRoutes);

  // Global error handler
  app.use((err, _req, res, _next) => {
    console.error("[error]", err.message);
    const status = err.response?.status || 500;
    res.status(status).json({ error: err.message || "Internal server error" });
  });

  return app;
}
