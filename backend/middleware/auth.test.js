import test, { describe } from "node:test";
import assert from "node:assert/strict";

// LEGACY_UNAUTH is deliberately absent here: `env` is frozen from process.env
// at import time, so one process can only ever observe one value of it. The
// flag-on cases live in auth.legacy.test.js, which node --test runs in its own
// child process. See the note in utils/tokens.test.js for why the import is
// dynamic.
const ACCESS = "a".repeat(40);
const REFRESH = "b".repeat(40);

process.env.DATABASE_URL = "postgresql://user:pass@host.neon.tech/db";
process.env.JWT_ACCESS_SECRET = ACCESS;
process.env.JWT_REFRESH_SECRET = REFRESH;
delete process.env.LEGACY_UNAUTH;

const { requireAuth, requireRealAuth, requireRole } = await import("./auth.js");
const { signAccessToken, signRefreshToken } = await import("../utils/tokens.js");
const { fakeReq, run } = await import("./httpDoubles.js");

const MARIA = { id: 12, username: "maria", role: "manager" };

describe("requireAuth with the legacy flag off", () => {
  test("populates req.user from a valid token", async () => {
    const req = fakeReq({ authorization: `Bearer ${signAccessToken(MARIA, [1, 3])}` });
    const { nexted } = await run(requireAuth, req);

    assert.equal(nexted, true);
    assert.deepEqual(req.user, {
      id: 12,
      username: "maria",
      role: "manager",
      shops: [1, 3],
    });
  });

  test("401s when no token is present", async () => {
    const { nexted, res } = await run(requireAuth, fakeReq());

    assert.equal(nexted, false);
    assert.equal(res.statusCode, 401);
  });

  test("401s on a malformed, forged or expired token", async () => {
    for (const header of [
      "Bearer not-a-token",
      "Bearer a.b.c",
      `Bearer ${signRefreshToken({ id: 12, token_version: 0 })}`, // right shape, wrong key
      signAccessToken(MARIA, [1]), // valid token, missing the Bearer prefix
      "Basic dXNlcjpwYXNz",
      "Bearer ",
    ]) {
      const { nexted, res } = await run(requireAuth, fakeReq({ authorization: header }));
      assert.equal(nexted, false, `expected a refusal for: ${header}`);
      assert.equal(res.statusCode, 401);
    }
  });

  test("keeps only the claims we put in the token", async () => {
    // req.user is assembled field by field rather than spread, so a claim that
    // is not ours cannot ride along into the controllers.
    const req = fakeReq({ authorization: `Bearer ${signAccessToken(MARIA, [1])}` });
    await run(requireAuth, req);

    assert.deepEqual(Object.keys(req.user).sort(), ["id", "role", "shops", "username"]);
  });
});

describe("requireRealAuth with the legacy flag off", () => {
  test("behaves exactly like requireAuth", async () => {
    const req = fakeReq({ authorization: `Bearer ${signAccessToken(MARIA, [2])}` });
    assert.equal((await run(requireRealAuth, req)).nexted, true);
    assert.equal(req.user.id, 12);

    assert.equal((await run(requireRealAuth, fakeReq())).res.statusCode, 401);
  });
});

describe("requireRole", () => {
  test("lets a listed role through", async () => {
    const req = fakeReq();
    req.user = { role: "manager" };
    assert.equal((await run(requireRole("manager", "super_admin"), req)).nexted, true);
  });

  test("403s an unlisted role", async () => {
    const req = fakeReq();
    req.user = { role: "worker" };
    const { nexted, res } = await run(requireRole("manager", "super_admin"), req);

    assert.equal(nexted, false);
    assert.equal(res.statusCode, 403);
  });

  test("403s when there is no actor at all", async () => {
    // Defence in depth: requireRole is always mounted behind requireAuth, but a
    // route that forgot the guard must fail closed rather than read `undefined`
    // off nothing and throw a 500.
    const { nexted, res } = await run(requireRole("worker"), fakeReq());

    assert.equal(nexted, false);
    assert.equal(res.statusCode, 403);
  });
});
