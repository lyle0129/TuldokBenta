// Run with: npm test  (Node's built-in test runner, no dependencies needed)
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  isInventoryLine,
  stockDeltas,
  validateItems,
  assertStockAvailable,
  toErrorResponse,
} from "./saleItems.js";

const item = (name, qty) => ({ type: "item", item_name: name, qty });
const service = (name, qty) => ({ type: "service", service_name: name, qty });

describe("isInventoryLine", () => {
  test("recognises an explicit item line", () => {
    assert.equal(isInventoryLine(item("Ariel", 1)), true);
  });

  test("ignores service lines", () => {
    assert.equal(isInventoryLine(service("Wash", 1)), false);
  });

  test("falls back to item_name when `type` is missing", () => {
    // Legacy rows and offline-synced sales don't always carry `type`. Without
    // this fallback their stock silently never moves.
    assert.equal(isInventoryLine({ item_name: "Ariel", qty: 2 }), true);
  });
});

describe("stockDeltas", () => {
  test("deducts everything on create", () => {
    const deltas = stockDeltas([], [item("Ariel", 3)]);
    assert.deepEqual([...deltas], [["Ariel", -3]]);
  });

  test("restores everything on delete", () => {
    const deltas = stockDeltas([item("Ariel", 3)], []);
    assert.deepEqual([...deltas], [["Ariel", 3]]);
  });

  test("returns only the difference when a quantity changes", () => {
    // The bug this replaces: restock 3 then deduct 1 as separate committed
    // statements, so a failure between them left stock permanently wrong.
    const deltas = stockDeltas([item("Ariel", 3)], [item("Ariel", 1)]);
    assert.deepEqual([...deltas], [["Ariel", 2]]);
  });

  test("omits items whose quantity did not change", () => {
    const deltas = stockDeltas([item("Ariel", 2)], [item("Ariel", 2)]);
    assert.equal(deltas.size, 0);
  });

  test("aggregates duplicate lines for the same item", () => {
    // The UI appends a second line rather than incrementing, so a sale can hold
    // the same item twice. Checking each line separately against the same stock
    // let a sale pass validation it could not afford.
    const deltas = stockDeltas([], [item("Ariel", 3), item("Ariel", 4)]);
    assert.deepEqual([...deltas], [["Ariel", -7]]);
  });

  test("handles a line being removed while another is added", () => {
    const deltas = stockDeltas([item("Ariel", 2)], [item("Tide", 5)]);
    assert.deepEqual(
      [...deltas].sort(),
      [
        ["Ariel", 2],
        ["Tide", -5],
      ].sort()
    );
  });

  test("ignores services entirely", () => {
    const deltas = stockDeltas([service("Wash", 1)], [service("Wash", 9)]);
    assert.equal(deltas.size, 0);
  });

  test("counts freebie lines like any other inventory line", () => {
    const freebie = {
      type: "item",
      item_name: "Ariel",
      qty: 2,
      price: 0,
      is_freebie: true,
    };
    assert.deepEqual([...stockDeltas([], [freebie])], [["Ariel", -2]]);
  });

  test("round-trips: applying a change then reversing it nets to zero", () => {
    const before = [item("Ariel", 3), item("Tide", 1)];
    const after = [item("Ariel", 1), item("Bleach", 4)];

    const forward = stockDeltas(before, after);
    const backward = stockDeltas(after, before);

    for (const [name, delta] of forward) {
      assert.equal(delta + (backward.get(name) || 0), 0, `${name} should net to 0`);
    }
  });
});

describe("validateItems", () => {
  const rejects = (items, pattern) =>
    assert.throws(() => validateItems(items), pattern);

  test("rejects a missing items payload", () => {
    // This used to throw mid-loop *after* inventory had been credited,
    // returning a 500 and leaving stock permanently inflated.
    rejects(undefined, /must be an array/);
  });

  test("rejects a non-array", () => rejects({ item_name: "Ariel" }, /must be an array/));

  test("rejects a negative quantity", () => {
    // `stock - qty` with a negative qty inflates inventory.
    rejects([item("Ariel", -5)], /Invalid quantity for Ariel/);
  });

  test("rejects zero and fractional quantities", () => {
    rejects([item("Ariel", 0)], /Invalid quantity/);
    rejects([item("Ariel", 1.5)], /Invalid quantity/);
  });

  test("rejects an inventory line with no name", () => {
    rejects([{ type: "item", qty: 1 }], /must have an item_name/);
  });

  test("accepts a well-formed mixed payload", () => {
    assert.doesNotThrow(() => validateItems([item("Ariel", 2), service("Wash", 1)]));
  });

  test("accepts an empty array (callers decide if that's allowed)", () => {
    assert.doesNotThrow(() => validateItems([]));
  });

  test("marks its errors as client errors", () => {
    try {
      validateItems(null);
    } catch (error) {
      assert.equal(error.status, 400);
    }
  });
});

describe("assertStockAvailable", () => {
  const rows = [{ item_name: "Ariel", stock: 5 }];

  test("passes when there is enough stock", () => {
    assert.doesNotThrow(() => assertStockAvailable(new Map([["Ariel", -5]]), rows));
  });

  test("rejects an oversell by name", () => {
    assert.throws(
      () => assertStockAvailable(new Map([["Ariel", -6]]), rows),
      /Not enough stock for Ariel/
    );
  });

  test("always allows restoring stock", () => {
    assert.doesNotThrow(() => assertStockAvailable(new Map([["Ariel", 99]]), rows));
  });

  test("rejects an item that is not in inventory", () => {
    assert.throws(
      () => assertStockAvailable(new Map([["Ghost", -1]]), rows),
      /Ghost not found in inventory/
    );
  });
});

describe("toErrorResponse", () => {
  test("passes through validation errors as 400", () => {
    const error = Object.assign(new Error("nope"), { status: 400 });
    assert.deepEqual(toErrorResponse(error), { status: 400, message: "nope" });
  });

  test("turns a check-constraint violation into a stock message", () => {
    // 23514 means the CHECK (stock >= 0) constraint fired, i.e. a concurrent
    // sale took the stock between our check and the transaction.
    const { status, message } = toErrorResponse({ code: "23514" });
    assert.equal(status, 400);
    assert.match(message, /Not enough stock/);
  });

  test("turns a unique violation into a 409", () => {
    assert.equal(toErrorResponse({ code: "23505" }).status, 409);
  });

  test("treats anything else as a server fault", () => {
    assert.deepEqual(toErrorResponse(new Error("boom")), {
      status: 500,
      message: "Internal Server Error",
    });
  });
});