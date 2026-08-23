import test, { describe } from "node:test";
import assert from "node:assert/strict";

// The flag-ON half of the shopScope suite, split from shopScope.test.js for the
// same reason auth.legacy.test.js is split from auth.test.js: `env` freezes
// legacyUnauth at import time, and node --test gives each file its own process.
process.env.DATABASE_URL = "postgresql://user:pass@host.neon.tech/db";
process.env.JWT_ACCESS_SECRET = "a".repeat(40);
process.env.JWT_REFRESH_SECRET = "b".repeat(40);
process.env.LEGACY_UNAUTH = "true";
process.env.LEGACY_SHOP_ID = "1";

const { env } = await import("../config/env.js");
const { makeResolveShop } = await import("./shopScope.js");
const { fakeReq, run } = await import("./httpDoubles.js");

const neverQueried = () => {
  const tag = () => {
    throw new Error("resolveShop should not have queried the database here");
  };
  return tag;
};

const LEGACY_ACTOR = {
  id: null,
  username: "legacy",
  role: "manager",
  shops: [1],
  legacy: true,
};

const withUser = (user, headers = {}) => {
  const req = fakeReq(headers);
  req.user = user;
  return req;
};

test("the flag really is on for this file", () => {
  assert.equal(env.legacyUnauth, true);
});

describe("resolveShop during the legacy window", () => {
  test("falls back to LEGACY_SHOP_ID for the synthetic legacy actor", async () => {
    const req = withUser(LEGACY_ACTOR);
    const { nexted } = await run(makeResolveShop(neverQueried()), req);

    assert.equal(nexted, true);
    assert.equal(req.shopId, 1);
  });

  test("still 400s an authenticated request that forgot the header", async () => {
    // The narrower half of this bypass, and the point of keying it off
    // `legacy` rather than off the flag alone. A real token with no X-Shop-Id
    // is a frontend bug; silently acting on shop 1 would make it a data bug in
    // whichever shop the user actually meant.
    const req = withUser({ id: 12, username: "maria", role: "manager", shops: [2, 3] });
    const { nexted, res } = await run(makeResolveShop(neverQueried()), req);

    assert.equal(nexted, false);
    assert.equal(res.statusCode, 400);
    assert.equal(req.shopId, undefined);
  });

  test("honours an explicit header even for the legacy actor", async () => {
    // The fallback is guarded on the header being absent, mirroring
    // requireAuth. A legacy actor that does name a shop is still checked
    // against the one shop it is allowed to name.
    const req = withUser(LEGACY_ACTOR, { "x-shop-id": "1" });
    const { nexted } = await run(makeResolveShop(neverQueried()), req);

    assert.equal(nexted, true);
    assert.equal(req.shopId, 1);
  });

  test("403s the legacy actor naming some other shop", async () => {
    const req = withUser(LEGACY_ACTOR, { "x-shop-id": "2" });
    const { nexted, res } = await run(makeResolveShop(neverQueried()), req);

    assert.equal(nexted, false);
    assert.equal(res.statusCode, 403);
  });
});
