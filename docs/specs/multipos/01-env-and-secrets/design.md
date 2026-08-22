# Design: Environment & Secrets Groundwork

## Overview

A small, purely additive ticket. It introduces one new module (`backend/config/env.js`), one
new file (`backend/.env.example`), and a boot-time guard. No behaviour changes for any
existing endpoint, and nothing the frontend can observe.

The design principle: **a missing signing secret must be a boot failure, never a default.**
The failure mode this prevents is the classic one — `process.env.JWT_SECRET || "dev-secret"`
shipping to production and letting anyone forge a `super_admin` token.

---

## Architecture

```
backend/
├── .env.example          ← NEW: the documented contract
├── config/
│   ├── env.js            ← NEW: read + validate + export
│   ├── db.js             ← unchanged
│   ├── cron.js           ← unchanged
│   ├── timezone.js       ← unchanged
│   └── initDB.js         ← unchanged in this ticket
└── server.js             ← imports config/env.js early; otherwise unchanged
```

`server.js` already has a deliberate import ordering discipline — `config/timezone.js` is
imported first so `TZ` is pinned before the Neon driver loads, then `dotenv.config()` runs.
`config/env.js` slots in immediately after `dotenv.config()` and before any module that
needs configuration.

```js
import "./config/timezone.js";        // unchanged — must stay first
import dotenv from "dotenv";
dotenv.config();

import { env } from "./config/env.js"; // NEW — validates or exits
import express from "express";
// ...
```

---

## Components and Interfaces

### `backend/config/env.js`

Exports a single frozen `env` object. Validation runs at module evaluation time, so merely
importing it is enough to enforce the contract.

```js
// Illustrative structure, not final code.
const required = (name) => {
  const value = process.env[name];
  if (!value) fail(`${name} is required but not set`);
  return value;
};

const secret = (name) => {
  const value = required(name);
  // 32 chars is the floor for an HMAC key that is not trivially brute-forced.
  if (value.length < 32) fail(`${name} must be at least 32 characters`);
  return value;
};

const fail = (message) => {
  console.error(`❌ Configuration error: ${message}`);
  process.exit(1);
};

const accessSecret  = secret("JWT_ACCESS_SECRET");
const refreshSecret = secret("JWT_REFRESH_SECRET");

// Distinct keys, so a leaked access secret cannot be used to mint refresh tokens —
// which are the long-lived half and the ones that survive a password change window.
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
  accessTokenTtl:  process.env.ACCESS_TOKEN_TTL  ?? "60m",
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL ?? "30d",

  // Exact-string comparison on purpose: "false", "0", "no" and unset must all be false.
  // A truthiness check would make LEGACY_UNAUTH=false leave the bypass switched on.
  legacyUnauth: process.env.LEGACY_UNAUTH === "true",
  legacyShopId: Number(process.env.LEGACY_SHOP_ID) || 1,

  seedSuperadminUsername: process.env.SEED_SUPERADMIN_USERNAME ?? null,
  seedSuperadminPassword: process.env.SEED_SUPERADMIN_PASSWORD ?? null,
});
```

Two details worth keeping:

- **`LEGACY_UNAUTH === "true"`, not truthiness.** Every non-empty string is truthy in
  JavaScript, so `LEGACY_UNAUTH=false` under a truthiness check would leave the
  authentication bypass *enabled*. That is precisely the variable where an inverted read is
  most dangerous, and it is the one an operator is most likely to set to the string
  `"false"` rather than unsetting.
- **Separate access and refresh secrets.** Reusing one key means a token leaked from either
  side can be replayed as the other. Cheap to keep separate; awkward to separate later.

### `backend/.env.example`

```ini
# --- Server -------------------------------------------------------------
PORT=5001
NODE_ENV=development

# Neon Postgres connection string.
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Public URL of THIS backend. Only used by the keep-alive cron in production.
API_URL=

# --- Auth (required from ticket 03 onward) ------------------------------
# Generate each independently:
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# Minimum 32 characters. The server refuses to boot without them, and they
# must not be equal to one another.
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=

# Token lifetimes, in the `ms`/jsonwebtoken format.
ACCESS_TOKEN_TTL=60m
REFRESH_TOKEN_TTL=30d

# --- Cutover ------------------------------------------------------------
# While "true", a request with NO token is treated as a manager on LEGACY_SHOP_ID,
# so the pre-auth frontend keeps working. Set to exactly "true" to enable;
# anything else (including unset) disables it. Removed entirely in ticket 12.
LEGACY_UNAUTH=false
LEGACY_SHOP_ID=1

# --- One-time super admin seed (ticket 03) ------------------------------
# Consumed once, only when the users table is empty. The account is created
# with must_change_password=TRUE. Unset both after the first successful boot.
SEED_SUPERADMIN_USERNAME=
SEED_SUPERADMIN_PASSWORD=
```

---

## Data Models

No database changes in this ticket.

---

## Secret generation

Both secrets, generated independently:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

48 random bytes render as 64 base64url characters, comfortably above the 32-character floor.
Run it twice and use the two different outputs — do not derive one from the other.

These go into the backend host's environment settings panel. They are never written to a
file in the repository; `backend/.env` is gitignored, but a hosted deploy reads its
environment from the host, not from a file.

---

## Error Handling

| Condition | Behaviour |
|---|---|
| `DATABASE_URL` missing | `console.error` + `process.exit(1)` at import time |
| `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` missing | `console.error` + `process.exit(1)` |
| Either secret shorter than 32 characters | `console.error` naming the variable + `process.exit(1)` |
| Both secrets equal | `console.error` + `process.exit(1)` |
| `LEGACY_UNAUTH` set to anything other than `"true"` | Treated as false, no warning |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL` unset | Defaults applied silently |
| Seed credentials unset | `null`; ticket 03 skips seeding |

`process.exit(1)` matches the existing failure convention in `config/initDB.js`, which exits
the same way when DDL fails. A backend that cannot verify tokens is no more useful than one
that cannot reach its database.

Note the ordering consequence: because `env.js` validates at import time and `server.js`
imports it before `initDB()` runs, a configuration error is reported *before* any DDL is
attempted. That is the right order — there is no point migrating a schema for a server that
is about to refuse to start.

---

## Correctness Properties

Property-based testing does not apply. This module reads a fixed, small set of named
variables and either exits or does not; there is no input space worth quantifying over. The
meaningful checks are the boundary cases in the Testing Strategy below, each of which is a
single targeted example.

---

## Testing Strategy

Backend tests use Node's built-in runner (`node --test`), matching the existing
`backend/utils/*.test.js` files.

Because `env.js` validates at import time and calls `process.exit`, tests must import it in
a child process rather than in-process. A small helper that spawns
`node -e "import('./config/env.js')"` with a controlled environment and asserts on the exit
code and stderr is the cleanest approach.

| Case | Expected |
|---|---|
| All variables set correctly | Exit 0, no stderr |
| `DATABASE_URL` unset | Exit 1, stderr names `DATABASE_URL` |
| `JWT_ACCESS_SECRET` unset | Exit 1, stderr names `JWT_ACCESS_SECRET` |
| `JWT_ACCESS_SECRET` set to 10 characters | Exit 1, stderr mentions the length requirement |
| Both secrets set to the same value | Exit 1, stderr mentions they must differ |
| `LEGACY_UNAUTH=false` | Exit 0, `env.legacyUnauth === false` |
| `LEGACY_UNAUTH=TRUE` (wrong case) | Exit 0, `env.legacyUnauth === false` |
| `LEGACY_UNAUTH=true` | Exit 0, `env.legacyUnauth === true` |
| TTLs unset | `60m` and `30d` |

### Manual verification

1. `npm run dev` in `backend/` with the secrets set — server starts as before,
   `GET /api/health` returns `{ status: "ok" }`.
2. Unset `JWT_ACCESS_SECRET` and start again — the process exits immediately with a message
   naming the variable, and `initDB()` is never reached.
3. Confirm the two hygiene commands from Requirement 5 both return empty.
