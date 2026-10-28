import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { env } from "./env.js";

const pool = new Pool({ connectionString: env.databaseUrl });

export const auth = betterAuth({
  appName: "PixieLearn",
  baseURL: env.authUrl,
  secret: env.authSecret,
  database: pool,
  trustedOrigins: [env.frontendUrl],
  emailAndPassword: { enabled: true },
  ...(env.googleClientId && env.googleClientSecret
    ? {
        socialProviders: {
          google: {
            clientId: env.googleClientId,
            clientSecret: env.googleClientSecret,
          },
        },
      }
    : {}),
  advanced: {
    useSecureCookies: env.nodeEnv === "production",
  },
});

export { pool };
