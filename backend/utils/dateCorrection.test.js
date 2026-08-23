// First, exactly as in server.js, and for exactly the same reason: these
// timestamps are read out of the process's local frame, which config/timezone.js
// pins to UTC so that it matches what the bare TIMESTAMP columns hold. Without
// this line the assertions below pass only on a machine that happens to run in
// UTC, and fail by the offset everywhere else — which is the bug the module is
// written to avoid, so the test has to be pinned the same way the server is.
import "../config/timezone.js";

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  SALE_TABLES,
  resolveSaleType,
  planDateCorrection,
  toTimestampText,
} from "./dateCorrection.js";

/** A fixed "now" so the future rule is a fact rather than a race with the clock. */
const NOW = Date.parse("2026-08-23T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const at = (ms) => new Date(ms);
const plan = (args) => planDateCorrection({ now: NOW, ...args });

describe("resolveSaleType", () => {
  test("accepts exactly the two table keys", () => {
    assert.equal(resolveSaleType("open"), "open");
    assert.equal(resolveSaleType("closed"), "closed");
    assert.deepEqual(Object.keys(SALE_TABLES), ["open", "closed"]);
  });

  test("rejects the near misses", () => {
    // Every one of these is something a hand-written URL could plausibly hold,
    // and each would name a real table if the string reached a query.
    for (const near of ["Open", "OPEN", " open", "open ", "open_sales", "closed_sales", "users"]) {
      assert.equal(resolveSaleType(near), null, near);
    }
  });

  // P3 — the allowlist is closed. Anything that is not one of the two literals
  // resolves to null, before any query exists to be injected into.
  test("P3: nothing else resolves, for any input at all", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.constantFrom(null, undefined, 0, 1, true, false),
          fc.array(fc.string()),
          fc.object()
        ),
        (value) => {
          if (value === "open" || value === "closed") return;
          assert.equal(resolveSaleType(value), null);
        }
      ),
      { numRuns: 500 }
    );
  });
});

describe("toTimestampText", () => {
  test("round trips a stored Date without shifting it", () => {
    // The process is pinned to UTC (config/timezone.js) and these columns hold
    // UTC, so the text must be the same wall clock the row already had.
    assert.equal(toTimestampText(new Date("2026-03-02T08:30:00.000Z")), "2026-03-02 08:30:00.000");
  });

  test("normalises a client string to the same shape", () => {
    assert.equal(toTimestampText("2026-03-02T08:30:00.000Z"), "2026-03-02 08:30:00.000");
    assert.equal(toTimestampText("2026-03-02 08:30:00"), "2026-03-02 08:30:00.000");
  });

  test("returns null for absence and for anything unreadable", () => {
    assert.equal(toTimestampText(null), null);
    assert.equal(toTimestampText(undefined), null);
    assert.equal(toTimestampText("not a date"), null);
  });
});

describe("planDateCorrection", () => {
  const closed = { created_at: at(NOW - 10 * DAY), paid_at: at(NOW - 9 * DAY) };
  const open = { created_at: at(NOW - 10 * DAY), paid_at: null };

  test("writes only the field that was submitted", () => {
    const result = plan({
      current: closed,
      patch: { created_at: "2026-08-01 09:00:00" },
      saleType: "closed",
    });

    assert.deepEqual(Object.keys(result.set), ["created_at"]);
    assert.equal(result.set.created_at, "2026-08-01 09:00:00.000");
    // The resulting pair still carries both, for the audit row's `after`.
    assert.equal(result.next.paid_at, toTimestampText(closed.paid_at));
  });

  test("refuses a payment date earlier than the creation date", () => {
    const result = plan({
      current: closed,
      patch: { paid_at: toTimestampText(at(NOW - 11 * DAY)) },
      saleType: "closed",
    });
    assert.equal(result.error.status, 400);
    assert.match(result.error.message, /paid before it was created/);
    assert.equal(result.set, undefined);
  });

  test("refuses a date more than a day in the future", () => {
    const result = plan({
      current: closed,
      patch: { created_at: toTimestampText(at(NOW + 8 * DAY)) },
      saleType: "closed",
    });
    assert.match(result.error.message, /future/);
  });

  test("allows a few hours in the future, for a till clock that runs fast", () => {
    const result = plan({
      current: { created_at: at(NOW - DAY), paid_at: at(NOW + 3 * 60 * 60 * 1000) },
      patch: { paid_at: toTimestampText(at(NOW + 3 * 60 * 60 * 1000)) },
      saleType: "closed",
    });
    assert.equal(result.error, undefined);
  });

  test("refuses to clear a closed sale's payment date", () => {
    for (const blank of [null, "", "   "]) {
      const result = plan({ current: closed, patch: { paid_at: blank }, saleType: "closed" });
      assert.match(result.error.message, /must keep a payment date/);
    }
  });

  test("refuses paid_at on an open sale at all", () => {
    // paySale moves a row into closed_sales rather than stamping this column, so
    // an open sale's paid_at is NULL for every row that is legitimately open.
    const result = plan({ current: open, patch: { paid_at: "2026-08-01" }, saleType: "open" });
    assert.match(result.error.message, /open sale has no payment date/);
  });

  test("accepts created_at alone on an open sale", () => {
    const result = plan({ current: open, patch: { created_at: "2026-08-01" }, saleType: "open" });
    assert.deepEqual(Object.keys(result.set), ["created_at"]);
    assert.equal(result.next.paid_at, null);
  });

  test("refuses an empty patch and an unreadable date", () => {
    assert.match(plan({ current: closed, patch: {}, saleType: "closed" }).error.message, /Send/);
    assert.match(
      plan({ current: closed, patch: { created_at: "yesterday" }, saleType: "closed" }).error
        .message,
      /could not be read/
    );
  });

  // P1 — the verdict depends only on the RESULTING pair, never on which field
  // the request happened to submit. Correcting paid_at alone and resubmitting
  // created_at unchanged alongside it must always agree.
  test("P1: the verdict depends only on the resulting pair", () => {
    const stamp = fc.integer({ min: NOW - 400 * DAY, max: NOW + 400 * DAY });

    fc.assert(
      fc.property(stamp, stamp, stamp, stamp, (created, paid, nextCreated, nextPaid) => {
        const current = { created_at: at(created), paid_at: at(paid) };

        for (const [partial, full] of [
          [{ created_at: toTimestampText(at(nextCreated)) }, { paid_at: toTimestampText(at(paid)) }],
          [{ paid_at: toTimestampText(at(nextPaid)) }, { created_at: toTimestampText(at(created)) }],
        ]) {
          const one = plan({ current, patch: partial, saleType: "closed" });
          const other = plan({ current, patch: { ...partial, ...full }, saleType: "closed" });

          assert.equal(one.error?.message ?? null, other.error?.message ?? null);
          assert.deepEqual(one.next ?? null, other.next ?? null);
        }
      }),
      { numRuns: 500 }
    );
  });

  // P2 — an accepted correction never leaves the pair out of order.
  test("P2: an accepted result is never paid before created", () => {
    const stamp = fc.integer({ min: NOW - 400 * DAY, max: NOW + 400 * DAY });
    const maybe = (arb) => fc.oneof(arb.map(toTimestampText), fc.constant(undefined));

    fc.assert(
      fc.property(
        stamp,
        stamp,
        maybe(stamp.map(at)),
        maybe(stamp.map(at)),
        (created, paid, patchCreated, patchPaid) => {
          const patch = {};
          if (patchCreated !== undefined) patch.created_at = patchCreated;
          if (patchPaid !== undefined) patch.paid_at = patchPaid;

          const result = plan({
            current: { created_at: at(created), paid_at: at(paid) },
            patch,
            saleType: "closed",
          });
          if (result.error) return;

          assert.notEqual(result.next.paid_at, null);
          assert.ok(
            Date.parse(result.next.paid_at) >= Date.parse(result.next.created_at),
            `${result.next.created_at} → ${result.next.paid_at}`
          );
          // And nothing accepted is ever more than a day out.
          assert.ok(Date.parse(result.next.paid_at) <= NOW + DAY);
          assert.ok(Date.parse(result.next.created_at) <= NOW + DAY);
        }
      ),
      { numRuns: 500 }
    );
  });
});
