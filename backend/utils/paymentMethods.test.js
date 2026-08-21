// Run with: npm test  (Node's built-in test runner, no dependencies needed)
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { assertMethodActive } from "./paymentMethods.js";

describe("assertMethodActive", () => {
  test("accepts a code the lookup found", () => {
    assert.doesNotThrow(() => assertMethodActive([{ code: "cash" }]));
  });

  test("rejects a code with no active row", () => {
    // The client caches the method list for five minutes, so a cashier can
    // still be offering one an admin just deactivated.
    assert.throws(() => assertMethodActive([]), {
      message: "That payment method is no longer available",
    });
  });

  test("rejects rather than passing when the lookup returned nothing at all", () => {
    assert.throws(() => assertMethodActive(undefined));
    assert.throws(() => assertMethodActive(null));
  });

  test("throws a 400, not a 500 — a stale method is the client's problem", () => {
    try {
      assertMethodActive([]);
      assert.fail("expected a throw");
    } catch (error) {
      assert.equal(error.status, 400);
    }
  });
});
