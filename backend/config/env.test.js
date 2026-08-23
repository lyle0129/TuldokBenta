import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// env.js validates while it is being evaluated and calls process.exit, so every
// case has to run in its own process. Importing it here would take this test
// runner down with it on the first failure case.
const ENV_MODULE = new URL("./env.js", import.meta.url).href;

// Absolute file:// URL rather than a relative specifier, so the child does not
// depend on the cwd `node --test` happens to be run from.
const SCRIPT = `import(${JSON.stringify(ENV_MODULE)}).then((m) => {
  console.log(JSON.stringify(m.env));
});`;

// Every variable env.js reads. Listing them lets each case start from a known
// state instead of inheriting a real secret from the developer's shell — which
// would quietly turn a "missing secret" case green.
const MANAGED = [
  "PORT",
  "DATABASE_URL",
  "NODE_ENV",
  "API_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "ACCESS_TOKEN_TTL",
  "REFRESH_TOKEN_TTL",
  "LEGACY_UNAUTH",
  "LEGACY_SHOP_ID",
  "SEED_SUPERADMIN_USERNAME",
  "SEED_SUPERADMIN_PASSWORD",
];

// Two distinct 40-character values: over the 32-character floor, and not equal.
const ACCESS = "a".repeat(40);
const REFRESH = "b".repeat(40);

const VALID = {
  DATABASE_URL: "postgresql://user:pass@host/db",
  JWT_ACCESS_SECRET: ACCESS,
  JWT_REFRESH_SECRET: REFRESH,
};

// `overrides` sets a variable; setting one to undefined removes it entirely,
// which is what "unset" has to mean here — an empty string is a different case.
const load = (overrides = {}) => {
  const childEnv = { ...process.env };
  for (const name of MANAGED) delete childEnv[name];

  for (const [name, value] of Object.entries({ ...VALID, ...overrides })) {
    if (value === undefined) delete childEnv[name];
    else childEnv[name] = value;
  }

  // spawnSync with an argv array: no shell, so nothing here needs quoting.
  const result = spawnSync(process.execPath, ["-e", SCRIPT], {
    env: childEnv,
    encoding: "utf8",
    cwd: fileURLToPath(new URL(".", import.meta.url)),
  });

  return {
    status: result.status,
    stderr: result.stderr,
    // Only meaningful when the child exited 0.
    env: result.status === 0 ? JSON.parse(result.stdout) : null,
  };
};

describe("config/env.js validation", () => {
  test("boots with every required variable set", () => {
    const { status, stderr, env } = load();
    assert.equal(status, 0, stderr);
    assert.equal(stderr, "");
    assert.equal(env.accessSecret, ACCESS);
    assert.equal(env.refreshSecret, REFRESH);
  });

  test("refuses to boot without DATABASE_URL", () => {
    const { status, stderr } = load({ DATABASE_URL: undefined });
    assert.equal(status, 1);
    assert.match(stderr, /DATABASE_URL/);
  });

  test("refuses to boot without a signing secret", () => {
    const access = load({ JWT_ACCESS_SECRET: undefined });
    assert.equal(access.status, 1);
    assert.match(access.stderr, /JWT_ACCESS_SECRET/);

    const refresh = load({ JWT_REFRESH_SECRET: undefined });
    assert.equal(refresh.status, 1);
    assert.match(refresh.stderr, /JWT_REFRESH_SECRET/);
  });

  test("rejects a secret shorter than 32 characters", () => {
    const { status, stderr } = load({ JWT_ACCESS_SECRET: "short12345" });
    assert.equal(status, 1);
    assert.match(stderr, /JWT_ACCESS_SECRET/);
    assert.match(stderr, /32 characters/);
  });

  test("rejects two identical secrets", () => {
    // Long enough to clear the length check, so this can only be the equality one.
    const { status, stderr } = load({ JWT_REFRESH_SECRET: ACCESS });
    assert.equal(status, 1);
    assert.match(stderr, /different values/);
  });
});

describe("config/env.js LEGACY_UNAUTH", () => {
  // An inverted read of this flag leaves the auth bypass on in production, which
  // is the worst defect this module can ship. Hence a case per spelling.
  test("is true only for the exact string \"true\"", () => {
    assert.equal(load({ LEGACY_UNAUTH: "true" }).env.legacyUnauth, true);
  });

  test("is false when unset", () => {
    assert.equal(load({ LEGACY_UNAUTH: undefined }).env.legacyUnauth, false);
  });

  test("is false for \"false\", not truthy-string true", () => {
    assert.equal(load({ LEGACY_UNAUTH: "false" }).env.legacyUnauth, false);
  });

  test("is false for the wrong case", () => {
    assert.equal(load({ LEGACY_UNAUTH: "TRUE" }).env.legacyUnauth, false);
  });
});

describe("config/env.js defaults", () => {
  test("defaults the token lifetimes", () => {
    const { env } = load({ ACCESS_TOKEN_TTL: undefined, REFRESH_TOKEN_TTL: undefined });
    assert.equal(env.accessTokenTtl, "60m");
    assert.equal(env.refreshTokenTtl, "30d");
  });

  test("keeps explicit token lifetimes", () => {
    const { env } = load({ ACCESS_TOKEN_TTL: "15m", REFRESH_TOKEN_TTL: "7d" });
    assert.equal(env.accessTokenTtl, "15m");
    assert.equal(env.refreshTokenTtl, "7d");
  });

  test("defaults port, shop id and node env", () => {
    const { env } = load({ PORT: undefined, LEGACY_SHOP_ID: undefined, NODE_ENV: undefined });
    assert.equal(env.port, 5001);
    assert.equal(env.legacyShopId, 1);
    assert.equal(env.nodeEnv, "development");
  });

  test("reads port and shop id as numbers", () => {
    const { env } = load({ PORT: "3000", LEGACY_SHOP_ID: "4" });
    assert.equal(env.port, 3000);
    assert.equal(env.legacyShopId, 4);
  });

  test("exposes unset optional values as null", () => {
    const { env } = load();
    assert.equal(env.apiUrl, null);
    assert.equal(env.seedSuperadminUsername, null);
    assert.equal(env.seedSuperadminPassword, null);
  });
});
