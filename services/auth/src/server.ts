import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth, pool } from "./auth.js";
import { env } from "./env.js";

const app = express();

app.use((request, response, next) => {
  const requestId = randomUUID();
  const startedAt = process.hrtime.bigint();
  response.setHeader("X-Request-ID", requestId);
  response.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.info(
      `request_completed request_id=${requestId} method=${request.method} path=${request.path} status_code=${response.statusCode} duration_ms=${durationMs.toFixed(2)}`,
    );
  });
  next();
});

app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    exposedHeaders: ["X-Request-ID"],
  }),
);

// Better Auth reads the raw request body, so mount its handler before parsers.
app.all("/api/auth/*splat", toNodeHandler(auth));
app.get("/health", (_request, response) => response.json({ status: "ok" }));

const server = app.listen(env.port, "0.0.0.0", () => {
  console.log(`PixieLearn auth listening on http://localhost:${env.port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
