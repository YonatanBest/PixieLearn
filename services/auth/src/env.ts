import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || "development",
  authUrl: process.env.BETTER_AUTH_URL || "http://localhost:3001",
  authSecret: required("BETTER_AUTH_SECRET"),
  databaseUrl: required("DATABASE_URL"),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:8443",
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
};

if (env.authSecret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be at least 32 characters.");
}

if (Number.isNaN(env.port) || env.port < 1 || env.port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}
