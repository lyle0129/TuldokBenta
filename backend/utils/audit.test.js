import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import { actorFrom, diff, makeRecordAudit, makeAuditQuery, ACTIONS } from "./audit.js";

/** A `sql` tag that always fails, for the "never throws" property. */
const explodingSql = () => Promise.reject(new Error("relation audit_log does not exist"));

/** A `sql` tag that records the values it was handed instead of sending them. */
const capturingSql = () => {
  const calls = [];
  const tag = (strings, ...values) => {
    calls.push(values);
    return Promise.resolve([]);
  };
  return { tag, calls };
};

const SECRETS = ["password", "password_hash", "token", "accessToken", "refreshToken"];

describe("actorFrom", () => {
  test("reads the snapshot off req.user", () => {
    const req = { user: { id: 7, username: "maria", role: "manager" }, ip: "10.0.0.4" };
    assert.deepEqual(actorFrom(req), {
      actor_user_id: 7,
      actor_username: "maria",
      actor_role: "manager",
      ip_address: "10.0.0.4",
    });
  });

  test("returns all nulls when there is no actor — the failed-login case", () => {
    // A failed login never reaches a guard, so req.user does not exist. Every
    // field has to land as NULL rather than undefined, or the insert drops the
    // column instead of writing one.
    for (const req of [{}, { user: undefined }, undefined]) {
      assert.deepEqual(actorFrom(req), {
        actor_user_id: null,
        actor_username: null,
        actor_role: null,
        ip_address: null,
      });
    }
  });
});

describe("diff", () => {
  test("reports only the fields that changed", () => {
    const before = { stock: 4, price: "10.00", item_name: "Bleach" };
    const after = { stock: 9, price: "10.00", item_name: "Bleach" };

    assert.deepEqual(diff(before, after, ["stock", "price", "item_name"]), {
      before: { stock: 4 },
      after: { stock: 9 },
    });
  });

  test("compares objects by shape, not by identity", () => {
    // A sale's `items` is parsed fresh on every request, so === would report
    // every update as having changed every line.
    const items = [{ name: "Wash", qty: 1 }];
    assert.deepEqual(diff({ items }, { items: [{ name: "Wash", qty: 1 }] }, ["items"]), {
      before: {},
      after: {},
    });
  });

  test("treats null and undefined as the same absence", () => {
    assert.deepEqual(diff({ customer_name: null }, {}, ["customer_name"]), {
      before: {},
      after: {},
    });
  });

  test("ignores keys it was not asked about", () => {
    assert.deepEqual(diff({ a: 1, b: 1 }, { a: 2, b: 2 }, ["a"]), {
      before: { a: 1 },
      after: { a: 2 },
    });
  });

  // P1 — every key in the result differs, every key absent from it was equal.
  //
  // Keys come from a fixed pool of real column names rather than fc.string().
  // Arbitrary strings generate "constructor" and "toString", which are not own
  // properties but still read back as inherited functions — noise that has
  // nothing to do with the property being tested.
  test("P1: the result is exactly the changed keys", () => {
    const KEYS = ["stock", "price", "item_name", "customer_name", "paid_using", "items"];

    const value = fc.oneof(
      fc.integer(),
      fc.string(),
      fc.boolean(),
      fc.constant(null),
      fc.array(fc.record({ name: fc.string(), qty: fc.integer() }), { maxLength: 3 })
    );
    const side = fc.dictionary(fc.constantFrom(...KEYS), value);

    /** An independent statement of "same value", mirroring the module's rule. */
    const same = (a, b) => {
      const text = (v) =>
        v === undefined || v === null
          ? null // absence, which no real value can equal
          : typeof v === "object"
            ? JSON.stringify(v)
            : String(v);
      return text(a) === text(b);
    };

    fc.assert(
      fc.property(side, side, (before, after) => {
        const result = diff(before, after, KEYS);

        for (const key of KEYS) {
          const present = Object.hasOwn(result.before, key) || Object.hasOwn(result.after, key);
          assert.equal(present, !same(before[key], after[key]), `key ${key}`);
        }
      }),
      { numRuns: 500 }
    );
  });

  // P2 — no secret ever reaches the output, at any depth, however it was asked for.
  test("P2: never leaks a secret", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (oldSecret, newSecret) => {
        const before = {
          password: oldSecret,
          password_hash: oldSecret,
          token: oldSecret,
          accessToken: oldSecret,
          refreshToken: oldSecret,
          nested: { deeper: { password: oldSecret, keep: 1 } },
        };
        const after = {
          password: newSecret,
          password_hash: newSecret,
          token: newSecret,
          accessToken: newSecret,
          refreshToken: newSecret,
          nested: { deeper: { password: newSecret, keep: 2 } },
        };

        // Asked for explicitly — the worst case, a caller who did not think.
        const result = diff(before, after, [...SECRETS, "nested"]);
        const serialised = JSON.stringify(result);

        for (const secret of SECRETS) {
          assert.equal(serialised.includes(`"${secret}"`), false, `${secret} key present`);
        }
        // The nested object still comes through, minus its password.
        assert.deepEqual(result.before.nested, { deeper: { keep: 1 } });
        assert.deepEqual(result.after.nested, { deeper: { keep: 2 } });
      }),
      { numRuns: 200 }
    );
  });
});

describe("recordAudit", () => {
  // P3 — the module cannot throw into a controller's success path.
  test("P3: resolves even when the insert always fails", async () => {
    const record = makeRecordAudit(explodingSql);
    const originalError = console.error;
    console.error = () => {}; // the failure is logged on purpose; keep it out of the run

    try {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.record({ action: fc.string(), entity_id: fc.integer() }),
            fc.constant({}),
            fc.constant(null),
            fc.constant(undefined)
          ),
          async (event) => {
            // No assertion needed beyond "this resolves" — an unhandled
            // rejection here would fail the test, which is the whole property.
            await record({ user: { id: 1 } }, event);
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      console.error = originalError;
    }
  });

  test("logs the failure rather than silently dropping it", async () => {
    const logged = [];
    const originalError = console.error;
    console.error = (...args) => logged.push(args);

    try {
      await makeRecordAudit(explodingSql)({}, { action: ACTIONS.sale.pay });
    } finally {
      console.error = originalError;
    }

    assert.equal(logged.length, 1);
    assert.ok(logged[0].join(" ").includes(ACTIONS.sale.pay));
  });

  test("an event overrides the actor snapshot — the failed-login case", async () => {
    const { tag, calls } = capturingSql();
    await makeRecordAudit(tag)(
      { ip: "10.0.0.9" },
      {
        action: ACTIONS.auth.loginFailed,
        actor_user_id: 12,
        actor_username: "maria",
        shop_id: null,
        entity_label: "maria",
      }
    );

    const [actorUserId, actorUsername, actorRole, shopId] = calls[0];
    assert.equal(actorUserId, 12);
    assert.equal(actorUsername, "maria");
    assert.equal(actorRole, null);
    assert.equal(shopId, null);
  });

  test("defaults shop_id to the request's resolved scope, never to the body", async () => {
    const { tag, calls } = capturingSql();
    await makeRecordAudit(tag)(
      { shopId: 3, user: { id: 1, username: "ana", role: "worker" }, body: { shop_id: 99 } },
      { action: ACTIONS.sale.create }
    );

    assert.equal(calls[0][3], 3);
  });
});

describe("auditQuery", () => {
  test("returns the query unawaited so it can join a transaction", () => {
    const { tag } = capturingSql();
    const result = makeAuditQuery(tag)({}, { action: ACTIONS.shop.create });
    // A thenable, not an awaited value: sql.transaction([...]) needs the query
    // itself to batch it into one round trip.
    assert.equal(typeof result.then, "function");
  });

  test("stringifies changes and strips secrets on the way in", async () => {
    const { tag, calls } = capturingSql();
    await makeAuditQuery(tag)(
      {},
      { action: ACTIONS.user.create, changes: { after: { username: "ana", password: "hunter2" } } }
    );

    const changes = calls[0][8];
    assert.equal(typeof changes, "string");
    assert.ok(changes.includes("ana"));
    assert.equal(changes.includes("hunter2"), false);
    assert.equal(changes.includes("password"), false);
  });
});
