/**
 * Feature: open/closed sales UX rework
 * Subject: utils/dateRange.js
 *
 * The closed-sales day picker is only correct if a "day" means the user's own
 * midnight-to-midnight, not UTC's. These tests pin the local-vs-UTC boundary
 * and the DST-safe day arithmetic.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { todayISODate, toISODate, dayRange, shiftDay } from "../utils/dateRange";

describe("toISODate / todayISODate", () => {
  it("uses local calendar fields, not the UTC date", () => {
    // 2026-08-17 23:30 local. toISOString() would report the 18th for anyone
    // east of Greenwich, which is the bug this avoids.
    const d = new Date(2026, 7, 17, 23, 30);
    expect(toISODate(d)).toBe("2026-08-17");
  });

  it("zero-pads single-digit months and days", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("todayISODate agrees with toISODate(new Date())", () => {
    expect(todayISODate()).toBe(toISODate(new Date()));
  });
});

describe("dayRange", () => {
  it("formats as 'YYYY-MM-DD HH:MM:SS' with no T or Z", () => {
    const { lowdate, highdate } = dayRange("2026-08-17");
    expect(lowdate).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(highdate).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("spans one local day, low before high", () => {
    const { lowdate, highdate } = dayRange("2026-08-17");
    expect(new Date(`${lowdate}Z`).getTime()).toBeLessThan(
      new Date(`${highdate}Z`).getTime()
    );
  });

  it("covers 23h59m59s — the whole day minus the final second", () => {
    const { lowdate, highdate } = dayRange("2026-08-17");
    const spanMs =
      new Date(`${highdate}Z`).getTime() - new Date(`${lowdate}Z`).getTime();
    expect(spanMs).toBe(23 * 3600_000 + 59 * 60_000 + 59_000);
  });

  it("starts at the caller's local midnight", () => {
    const { lowdate } = dayRange("2026-08-17");
    // Reading the UTC instant back as local time must land on midnight.
    const asLocal = new Date(`${lowdate}Z`);
    expect(asLocal.getHours()).toBe(0);
    expect(asLocal.getMinutes()).toBe(0);
    expect(toISODate(asLocal)).toBe("2026-08-17");
  });
});

describe("shiftDay", () => {
  it("steps back one day", () => {
    expect(shiftDay("2026-08-17", -1)).toBe("2026-08-16");
  });

  it("steps forward one day", () => {
    expect(shiftDay("2026-08-17", 1)).toBe("2026-08-18");
  });

  it("crosses a month boundary backwards", () => {
    expect(shiftDay("2026-08-01", -1)).toBe("2026-07-31");
  });

  it("crosses a year boundary forwards", () => {
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(shiftDay("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDay("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("is reversible for any date in a wide range", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date(2000, 0, 1), max: new Date(2050, 11, 31) }),
        (date) => {
          const iso = toISODate(date);
          // A DST transition is exactly where naive ±86400000ms arithmetic
          // lands on the same or a skipped day; setDate() does not.
          expect(shiftDay(shiftDay(iso, -1), 1)).toBe(iso);
        }
      )
    );
  });

  it("always returns a well-formed ISO date", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date(2000, 0, 1), max: new Date(2050, 11, 31) }),
        fc.integer({ min: -400, max: 400 }),
        (date, offset) => {
          expect(shiftDay(toISODate(date), offset)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      )
    );
  });
});
