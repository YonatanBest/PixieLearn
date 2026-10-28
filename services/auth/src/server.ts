import cors from "cors";
import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth, pool } from "./auth.js";
import { env } from "./env.js";

const app = express();

app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
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
