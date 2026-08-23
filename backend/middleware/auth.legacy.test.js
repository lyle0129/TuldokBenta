import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// The flag-ON half of the auth middleware suite. It is a separate file because
// `env` is frozen from process.env at import time, so a single process can only
// observe one value of legacyUnauth — and node --test gives each test file its
// own child process, which makes the split the whole harness.
const ACCESS = "a".repeat(40);
const REFRESH = "b".repeat(40);

process.env.DATABASE_URL = "postgresql://user:pass@host.neon.tech/db";
process.env.JWT_ACCESS_SECRET = ACCESS;
process.env.JWT_REFRESH_SECRET = REFRESH;
process.env.LEGACY_UNAUTH = "true";
process.env.LEGACY_SHOP_ID = "1";

const { env } = await import("../config/env.js");
const { requireAuth, requireRealAuth } = await import("./auth.js");
const { signAccessToken, signRefreshToken } = await import("../utils/tokens.js");
const { fakeReq, run } = await import("./httpDoubles.js");

const MARIA = { id: 12, username: "maria", role: "manager" };

test("the flag really is on for this file", () => {
  // If this ever fails, every assertion below is testing the flag-off paths
  // again and quietly proving nothing.
  assert.equal(env.legacyUnauth, true);
});

describe("the legacy window", () => {
  test("treats a request with no Authorization header as a manager on the legacy shop", async () => {
    const req = fakeReq();
    const { nexted } = await run(requireAuth, req);

    assert.equal(nexted, true);
    assert.deepEqual(req.user, {
      id: null,
      username: "legacy",
      role: "manager",
      shops: [1],
      legacy: true,
    });
  });

  test("still honours a valid token rather than flattening everyone to legacy", async () => {
    const req = fakeReq({ authorization: `Bearer ${signAccessToken(MARIA, [2, 5])}` });
    const { nexted } = await run(requireAuth, req);

    assert.equal(nexted, true);
    assert.equal(req.user.id, 12);
    assert.equal(req.user.legacy, undefined);
    assert.deepEqual(req.user.shops, [2, 5]);
  });

  test("does not extend to requireRealAuth", async () => {
    // Which is why every /api/auth route mounts that guard instead. The legacy
    // contract covers the endpoints the old frontend calls; it does not extend
    // to endpoints that did not exist when that frontend was built.
    const { nexted, res } = await run(requireRealAuth, fakeReq());

    assert.equal(nexted, false);
    assert.equal(res.statusCode, 401);
  });
});

describe("P6 — a present Authorization header never yields the legacy actor", () => {
  // The property this whole ticket turns on. The bypass is guarded on the
  // header being ABSENT; written instead as "fall back whenever verification
  // failed", every malformed token would become a manager session and the
  // compatibility window would be an authentication bypass. Asserting it
  // exhaustively is cheap, so there is no excuse not to.
  test("holds for arbitrary header values", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (header) => {
        const req = fakeReq({ authorization: header });
        const { nexted, res } = runSync(requireAuth, req);

        if (nexted) {
          // The only way through is a genuinely valid token, never the
          // synthetic actor.
          assert.equal(req.user.legacy, undefined);
          assert.notEqual(req.user.username, "legacy");
          assert.equal(typeof req.user.id, "number");
        } else {
          assert.equal(res.statusCode, 401);
          assert.equal(req.user, undefined);
        }
      })
    );
  });

  test("holds for the header shapes most likely to be tried on purpose", () => {
    // A real super_admin token with its signature broken — the shape an
    // attacker reaches for once they know a bypass exists.
    const forged = signAccessToken({ id: 1, username: "root", role: "super_admin" }, [1]);
    const tampered = `${forged.slice(0, -1)}${forged.endsWith("X") ? "Y" : "X"}`;

    const attempts = [
      "Bearer",
      "Bearer ",
      "Bearer null",
      "Bearer undefined",
      "Bearer legacy",
      "Bearer a.b.c",
      `Bearer ${tampered}`,
      // The right shape, signed with the refresh key rather than the access one.
      `Bearer ${signRefreshToken({ id: 12, token_version: 0 })}`,
      " ",
      "0",
    ];

    for (const header of attempts) {
      const req = fakeReq({ authorization: header });
      const { nexted, res } = runSync(requireAuth, req);

      assert.equal(nexted, false, `expected a refusal for: ${header}`);
      assert.equal(res.statusCode, 401);
      assert.equal(req.user, undefined);
    }
  });
});

/** The synchronous twin of httpDoubles' `run`, for use inside fc properties. */
function runSync(middleware, req) {
  const res = { statusCode: null, body: null };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => ((res.body = body), res);

  let nexted = false;
  middleware(req, res, () => (nexted = true));
  return { nexted, res };
}
