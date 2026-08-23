// config/env.js
// The one place the backend reads its environment. Validation runs at module
// evaluation time, so importing this module is enough to enforce the contract —
// a misconfigured server stops at boot instead of running half-configured.
//
// Deliberately does NOT import dotenv: server.js calls dotenv.config() before
// importing this, and keeping the file dotenv-free lets the tests hand a child
// process an environment of their own without a .env leaking into it.

const fail = (message) => {
  console.error(`❌ Configuration error: ${message}`);
  // Matches initDB.js, which exits the same way when its DDL fails. A server
  // that cannot verify a token is no more useful than one with no database.
  process.exit(1);
};

const required = (name) => {
  const value = process.env[name];
  if (!value) fail(`${name} is required but not set`);
  return value;
};

const secret = (name) => {
  const value = required(name);
  // 32 characters is the floor for an HMAC key that is not worth brute-forcing.
  // There is no default here, and there must never be one: a fallback secret is
  // a published secret, and anyone holding it can mint a super_admin token.
  if (value.length < 32) {
    fail(`${name} must be at least 32 characters, got ${value.length}`);
  }
  return value;
};

/**
 * An optional whole number of days, or null when the variable is unset.
 *
 * Unset means the retention sweep does not run at all — deleting audit rows is
 * not something to start doing because somebody forgot to configure it. A value
 * that is present but unusable is a boot failure rather than a silent fallback,
 * for the same reason the secrets above are: a typo that quietly disables a
 * retention policy is discovered by the disk bill.
 */
const optionalDays = (name) => {
  const raw = process.env[name];
  if (!raw) return null;

  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1) {
    fail(`${name} must be a whole number of days of at least 1, got "${raw}"`);
  }
  return days;
};

const accessSecret = secret("JWT_ACCESS_SECRET");
const refreshSecret = secret("JWT_REFRESH_SECRET");

// Separate keys, so a token leaked from one side cannot be replayed as the
// other — refresh tokens are the long-lived half and outlive a password change.
if (accessSecret === refreshSecret) {
  fail("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values");
}

export const env = Object.freeze({
  port: Number(process.env.PORT) || 5001,
  databaseUrl: required("DATABASE_URL"),
  nodeEnv: process.env.NODE_ENV ?? "development",
  apiUrl: process.env.API_URL ?? null,

  accessSecret,
  refreshSecret,
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "60m",
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL ?? "30d",

  // Exact-string comparison on purpose. Every non-empty string is truthy in
  // JavaScript, so a truthiness check would read LEGACY_UNAUTH=false as *on* and
  // leave the authentication bypass running. Unset, "false", "0" and "TRUE" are
  // all false; only the exact string "true" enables it.
  legacyUnauth: process.env.LEGACY_UNAUTH === "true",
  legacyShopId: Number(process.env.LEGACY_SHOP_ID) || 1,

  // How long an audit event is kept. Null — the default — means the retention
  // sweep is off and the table grows forever, which is the right default for a
  // log: losing history has to be something somebody chose.
  auditRetentionDays: optionalDays("AUDIT_RETENTION_DAYS"),

  // Consumed once by the super-admin seed, and null the rest of the time.
  seedSuperadminUsername: process.env.SEED_SUPERADMIN_USERNAME ?? null,
  seedSuperadminPassword: process.env.SEED_SUPERADMIN_PASSWORD ?? null,
});
