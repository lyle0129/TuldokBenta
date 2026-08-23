import test, { describe } from "node:test";
import assert from "node:assert/strict";

// Legacy flag off here; its one interaction with resolveShop is covered in
// shopScope.legacy.test.js, for the same frozen-env reason as auth.test.js.
process.env.DATABASE_URL = "postgresql://user:pass@host.neon.tech/db";
process.env.JWT_ACCESS_SECRET = "a".repeat(40);
process.env.JWT_REFRESH_SECRET = "b".repeat(40);
delete process.env.LEGACY_UNAUTH;

const { makeResolveShop } = await import("./shopScope.js");
const { fakeReq, run } = await import("./httpDoubles.js");

/**
 * A `sql` tag standing in for the shops lookup.
 *
 * `activeIds` is the set of shops that exist AND are active — the middleware's
 * query filters on both, so one set models both conditions, and a shop that is
 * inactive is indistinguishable from one that was never created. That is the
 * intent: neither should tell a super admin anything.
 */
const fakeSql = (activeIds) => {
  const calls = [];
  const tag = (_strings, ...values) => {
    calls.push(values);
    return Promise.resolve(activeIds.includes(values[0]) ? [{ "?column?": 1 }] : []);
  };
  tag.calls = calls;
  return tag;
};

const withUser = (user, headers = {}) => {
  const req = fakeReq(headers);
  req.user = user;
  return req;
};

const MANAGER = { id: 12, username: "maria", role: "manager", shops: [1, 3] };
const WORKER = { id: 20, username: "ana", role: "worker", shops: [3] };
const SUPER = { id: 1, username: "root", role: "super_admin", shops: [] };

describe("resolveShop for an assigned user", () => {
  test("resolves a shop the actor is assigned to", async () => {
    const resolveShop = makeResolveShop(fakeSql([1, 2, 3]));
    const req = withUser(MANAGER, { "x-shop-id": "3" });
    const { nexted } = await run(resolveShop, req);

    assert.equal(nexted, true);
    assert.equal(req.shopId, 3);
  });

  test("sets a number, not the raw header string", async () => {
    // Ticket 04's queries compare shop_id against this. A string "3" would work
    // through Postgres's coercion and then quietly fail every JavaScript-side
    // comparison, which is the worse half of the bug.
    const resolveShop = makeResolveShop(fakeSql([3]));
    const req = withUser(WORKER, { "x-shop-id": "3" });
    await run(resolveShop, req);

    assert.strictEqual(req.shopId, 3);
  });

  test("403s a shop the actor is not assigned to", async () => {
    const resolveShop = makeResolveShop(fakeSql([1, 2, 3]));
    const req = withUser(WORKER, { "x-shop-id": "1" }); // exists, but not ana's
    const { nexted, res } = await run(resolveShop, req);

    assert.equal(nexted, false);
    assert.equal(res.statusCode, 403);
    assert.equal(req.shopId, undefined);
  });

  test("does not hit the database for a non-super-admin", async () => {
    // The assignment list is already in the token. Reading shops here would put
    // a query on every till request, which is exactly what carrying the list in
    // the token exists to avoid.
    const sql = fakeSql([1, 2, 3]);
    await run(makeResolveShop(sql), withUser(MANAGER, { "x-shop-id": "3" }));

    assert.equal(sql.calls.length, 0);
  });
});

describe("resolveShop header validation", () => {
  const cases = {
    "missing entirely": undefined,
    empty: "",
    "not a number": "abc",
    "a float": "1.5",
    zero: "0",
    negative: "-1",
    "a list": "1,2",
    // Number("") and Number("   ") are both 0, not NaN, so these two reach the
    // guard as a valid integer and it is the `<= 0` half that catches them.
    "only whitespace": "   ",
    "SQL-shaped": "1 OR 1=1",
  };

  for (const [name, value] of Object.entries(cases)) {
    test(`400s when X-Shop-Id is ${name}`, async () => {
      const resolveShop = makeResolveShop(fakeSql([1, 2, 3]));
      const headers = value === undefined ? {} : { "x-shop-id": value };
      const req = withUser(MANAGER, headers);
      const { nexted, res } = await run(resolveShop, req);

      assert.equal(nexted, false);
      assert.equal(res.statusCode, 400);
      assert.equal(req.shopId, undefined);
    });
  }
});

describe("resolveShop for a super admin", () => {
  test("resolves any active shop, including one not in their token", async () => {
    // SUPER.shops is empty on purpose: a super admin's access is resolved from
    // the shops table, so a shop created after their token was issued is
    // reachable without signing out and back in.
    const resolveShop = makeResolveShop(fakeSql([1, 2, 3, 9]));
    const req = withUser(SUPER, { "x-shop-id": "9" });
    const { nexted } = await run(resolveShop, req);

    assert.equal(nexted, true);
    assert.equal(req.shopId, 9);
  });

  test("403s an inactive or non-existent shop", async () => {
    const resolveShop = makeResolveShop(fakeSql([1, 2, 3]));
    const req = withUser(SUPER, { "x-shop-id": "7" });
    const { nexted, res } = await run(resolveShop, req);

    assert.equal(nexted, false);
    assert.equal(res.statusCode, 403);
    assert.equal(req.shopId, undefined);
  });

  test("passes the parsed number to the query, never the raw header", async () => {
    const sql = fakeSql([4]);
    await run(makeResolveShop(sql), withUser(SUPER, { "x-shop-id": "4" }));

    assert.equal(sql.calls.length, 1);
    assert.strictEqual(sql.calls[0][0], 4);
  });
});

describe("resolveShop with no actor", () => {
  test("403s rather than throwing", async () => {
    // resolveShop is always mounted behind requireAuth, but a route that forgot
    // the guard must fail closed instead of reading .shops off undefined and
    // turning a missing middleware into a 500.
    const resolveShop = makeResolveShop(fakeSql([1]));
    const { nexted, res } = await run(resolveShop, fakeReq({ "x-shop-id": "1" }));

    assert.equal(nexted, false);
    assert.equal(res.statusCode, 403);
  });
});
