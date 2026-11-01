import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function trustedOrigins(value: string): string[] {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error(`FRONTEND_URLS contains an invalid origin: ${origin}`);
      }

      if (
        (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
        parsed.username ||
        parsed.password ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash
      ) {
        throw new Error(
          `FRONTEND_URLS must contain only http(s) origins: ${origin}`,
        );
      }

      return parsed.origin;
    });

  const uniqueOrigins = [...new Set(origins)];
  if (uniqueOrigins.length === 0) {
    throw new Error("FRONTEND_URLS must contain at least one origin.");
  }

  return uniqueOrigins;
}

const frontendOrigins = trustedOrigins(
  process.env.FRONTEND_URLS ||
    process.env.FRONTEND_URL ||
    "http://localhost:8443",
);

export const env = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || "development",
  authUrl: process.env.BETTER_AUTH_URL || "http://localhost:3001",
  authSecret: required("BETTER_AUTH_SECRET"),
  databaseUrl: required("DATABASE_URL"),
  frontendOrigins,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
};

if (env.authSecret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be at least 32 characters.");
}

if (Number.isNaN(env.port) || env.port < 1 || env.port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}
