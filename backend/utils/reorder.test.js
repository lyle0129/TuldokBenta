import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { invalidOrderedIds, MAX_REORDER_IDS } from "./reorder.js";

describe("invalidOrderedIds", () => {
  test("accepts a plain list of ids", () => {
    assert.equal(invalidOrderedIds([3, 1, 2]), null);
    assert.equal(invalidOrderedIds([7]), null);
  });

  test("accepts numeric strings, since ids arrive over JSON", () => {
    assert.equal(invalidOrderedIds(["3", "1", "2"]), null);
  });

  test("rejects anything that is not a non-empty array", () => {
    assert.match(invalidOrderedIds([]), /non-empty array/);
    assert.match(invalidOrderedIds("nope"), /non-empty array/);
    assert.match(invalidOrderedIds(undefined), /non-empty array/);
    assert.match(invalidOrderedIds({ 0: 1 }), /non-empty array/);
  });

  test("rejects entries that are not whole ids", () => {
    assert.match(invalidOrderedIds([1, "abc"]), /must be an id/);
    assert.match(invalidOrderedIds([1, 2.5]), /must be an id/);
    assert.match(invalidOrderedIds([1, -3]), /must be an id/);
    // SERIAL starts at 1, so 0 is never a real row.
    assert.match(invalidOrderedIds([1, 0]), /must be an id/);
  });

  test("rejects values Number() would quietly coerce to 0", () => {
    // These all pass `Number.isInteger(Number(v))`, which is how a junk entry
    // used to slip through and silently renumber nothing.
    for (const junk of [null, undefined, "", "   ", [], false, {}]) {
      assert.match(invalidOrderedIds([1, junk]), /must be an id/, `${junk}`);
    }
  });

  test("rejects duplicates, which would leave two rows sharing a position", () => {
    assert.match(invalidOrderedIds([1, 2, 1]), /duplicate/);
    // Same id in two spellings still collides once written.
    assert.match(invalidOrderedIds([1, "1"]), /duplicate/);
  });

  test("caps how many rows one call may renumber", () => {
    const tooMany = Array.from({ length: MAX_REORDER_IDS + 1 }, (_, i) => i + 1);
    assert.match(invalidOrderedIds(tooMany), /more than/);

    const justEnough = Array.from({ length: MAX_REORDER_IDS }, (_, i) => i + 1);
    assert.equal(invalidOrderedIds(justEnough), null);
  });
});
