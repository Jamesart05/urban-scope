import cors from "cors";
import express from "express";
import { config } from "./config.js";
import analysisRoutes from "./routes/analysisRoutes.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: config.clientOrigin
    })
  );
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/api", analysisRoutes);

  app.use((error, _request, response, _next) => {
    const statusCode = error.response?.status || 500;
    const message =
      error.response?.data?.error_message ||
      error.message ||
      "Internal server error";

    response.status(statusCode).json({
      error: message
    });
  });

  return app;
}

