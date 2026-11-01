import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const envModule = new URL("../dist/env.js", import.meta.url).href;

function importEnvironment(overrides = {}) {
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { env } = await import(${JSON.stringify(envModule)}); console.log(JSON.stringify(env.frontendOrigins));`,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        BETTER_AUTH_SECRET: "0123456789abcdefghijklmnopqrstuv",
        DATABASE_URL: "postgres://pixielearn:pixielearn@localhost:5432/pixielearn",
        ...overrides,
      },
    },
  );
}

test("loads valid auth configuration", () => {
  const result = importEnvironment({
    PORT: "3001",
    FRONTEND_URLS:
      "http://localhost:8443, http://192.168.1.100:8443, http://localhost:8443",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    "http://localhost:8443",
    "http://192.168.1.100:8443",
  ]);
});

test("supports the legacy single frontend origin setting", () => {
  const result = importEnvironment({ FRONTEND_URL: "http://localhost:8443" });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ["http://localhost:8443"]);
});

test("rejects frontend URLs that are not origins", () => {
  const result = importEnvironment({
    FRONTEND_URLS: "http://localhost:8443/app",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must contain only http\(s\) origins/);
});

test("requires a Better Auth secret", () => {
  const result = importEnvironment({ BETTER_AUTH_SECRET: "" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing required environment variable: BETTER_AUTH_SECRET/);
});

test("rejects a secret shorter than 32 characters", () => {
  const result = importEnvironment({ BETTER_AUTH_SECRET: "too-short" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BETTER_AUTH_SECRET must be at least 32 characters/);
});

test("rejects a port outside the valid TCP range", () => {
  const result = importEnvironment({ PORT: "70000" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PORT must be a valid TCP port/);
});
