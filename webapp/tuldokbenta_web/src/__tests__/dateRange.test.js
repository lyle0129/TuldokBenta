/**
 * Feature: open/closed sales UX rework
 * Subject: utils/dateRange.js
 *
 * The closed-sales day picker is only correct if a "day" means the user's own
 * midnight-to-midnight, not UTC's. These tests pin the local-vs-UTC boundary
 * and the DST-safe day arithmetic.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import fc from "fast-check";
import {
  todayISODate,
  toISODate,
  dayRange,
  shiftDay,
  shiftRange,
  matchPreset,
  rangeBounds,
  localRangeBounds,
  presetRange,
  RANGE_PRESETS,
} from "../utils/dateRange";

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
  it("formats as 'YYYY-MM-DD HH:MM:SS.mmm' with no T or Z", () => {
    const { lowdate, highdate } = dayRange("2026-08-17");
    expect(lowdate).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
    expect(highdate).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it("spans one local day, low before high", () => {
    const { lowdate, highdate } = dayRange("2026-08-17");
    expect(new Date(`${lowdate}Z`).getTime()).toBeLessThan(
      new Date(`${highdate}Z`).getTime()
    );
  });

  /**
   * The server compares with an inclusive BETWEEN against columns that keep
   * milliseconds, so stopping at 23:59:59 would drop a sale made in the last
   * second of the day.
   */
  it("covers the whole day, down to the last millisecond", () => {
    const { lowdate, highdate } = dayRange("2026-08-17");
    const spanMs =
      new Date(`${highdate}Z`).getTime() - new Date(`${lowdate}Z`).getTime();
    expect(spanMs).toBe(24 * 3600_000 - 1);
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

describe("rangeBounds", () => {
  it("spans from the first day's local midnight to the last day's last second", () => {
    const { lowdate, highdate } = rangeBounds("2026-08-17", "2026-08-19");
    const start = new Date(`${lowdate}Z`);
    const end = new Date(`${highdate}Z`);

    expect(toISODate(start)).toBe("2026-08-17");
    expect(start.getHours()).toBe(0);
    expect(toISODate(end)).toBe("2026-08-19");
    expect(end.getHours()).toBe(23);
  });

  it("collapses to dayRange when both ends are the same day", () => {
    expect(rangeBounds("2026-08-17", "2026-08-17")).toEqual(dayRange("2026-08-17"));
  });

  /**
   * The sale timestamps are stored in UTC while the shop keeps its own clock,
   * so the window the server is asked for has to be the shop's midnight
   * expressed in UTC — not UTC's own midnight. This is the conversion the whole
   * day-attribution rests on.
   */
  it("sends the shop's midnight, converted to UTC", () => {
    const { lowdate } = rangeBounds("2026-08-17", "2026-08-17");
    const asInstant = new Date(`${lowdate}Z`);
    // Read back in local time it must land exactly on the requested midnight.
    expect(toISODate(asInstant)).toBe("2026-08-17");
    expect(asInstant.getHours()).toBe(0);
    expect(asInstant.getMinutes()).toBe(0);
  });

  /** The browser-side and server-side windows must describe the same span. */
  it("agrees with localRangeBounds to the millisecond", () => {
    const { start, end } = localRangeBounds("2026-08-17", "2026-08-19");
    const { lowdate, highdate } = rangeBounds("2026-08-17", "2026-08-19");

    expect(new Date(`${lowdate}Z`).getTime()).toBe(start.getTime());
    expect(new Date(`${highdate}Z`).getTime()).toBe(end.getTime());
  });
});

describe("presetRange", () => {
  afterEach(() => vi.useRealTimers());

  /**
   * The bug this pins: the old quick-filter took its date from
   * `toISOString()`, so in UTC+8 every morning before 08:00 it selected
   * *yesterday* — the report opened on the wrong day for the first eight hours
   * of every trading day.
   */
  it("picks the local day, not the UTC one, early in the morning", () => {
    // 07:00 local on 2026-08-19. Anywhere ahead of UTC, the UTC date here is
    // still the 18th.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 19, 7, 0));

    const expected = toISODate(new Date(2026, 7, 19));
    expect(presetRange("today")).toEqual({ from: expected, to: expected });
  });

  it("spans 7 and 30 days inclusive of today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 19, 12));

    expect(presetRange("7d")).toEqual({ from: "2026-08-13", to: "2026-08-19" });
    expect(presetRange("30d")).toEqual({ from: "2026-07-21", to: "2026-08-19" });
  });

  it("starts 'this month' on the first, even mid-month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 19, 12));

    expect(presetRange("month")).toEqual({ from: "2026-08-01", to: "2026-08-19" });
  });

  it("never returns a range ending in the future", () => {
    const today = todayISODate();
    for (const { id } of RANGE_PRESETS) {
      const { from, to } = presetRange(id);
      expect(to).toBe(today);
      expect(from <= to).toBe(true);
    }
  });

  it("falls back to today for an unknown preset", () => {
    const today = todayISODate();
    expect(presetRange("nonsense")).toEqual({ from: today, to: today });
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

describe("shiftRange", () => {
  it("steps a one-day range like a day picker", () => {
    expect(shiftRange("2026-08-17", "2026-08-17", -1)).toEqual({
      from: "2026-08-16",
      to: "2026-08-16",
    });
  });

  /**
   * The report dates a range with a pair, so moving only `from` would widen
   * the window instead of stepping it — the whole point of shifting both ends.
   */
  it("keeps a multi-day window the same width", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date(2000, 0, 1), max: new Date(2050, 0, 1) }),
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: -60, max: 60 }),
        (date, span, step) => {
          const from = toISODate(date);
          const to = shiftDay(from, span);
          const next = shiftRange(from, to, step);

          const days = (a, b) =>
            Math.round(
              (new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86_400_000
            );
          expect(days(next.from, next.to)).toBe(span);
        }
      )
    );
  });

  it("is reversible", () => {
    const once = shiftRange("2026-08-13", "2026-08-19", -1);
    expect(shiftRange(once.from, once.to, 1)).toEqual({
      from: "2026-08-13",
      to: "2026-08-19",
    });
  });
});

describe("matchPreset", () => {
  afterEach(() => vi.useRealTimers());

  it("names the preset a range belongs to", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 19, 12));

    expect(matchPreset("2026-08-19", "2026-08-19")).toBe("today");
    expect(matchPreset("2026-08-13", "2026-08-19")).toBe("7d");
    expect(matchPreset("2026-08-01", "2026-08-19")).toBe("month");
  });

  it("calls a stepped-back range custom", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 19, 12));

    expect(matchPreset("2026-08-18", "2026-08-18")).toBe("custom");
    expect(matchPreset("2026-08-12", "2026-08-18")).toBe("custom");
  });

  /** Stepping back and forward again must land on a preset, not on "custom". */
  it("round-trips with shiftRange", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 19, 12));

    const { from, to } = presetRange("7d");
    const back = shiftRange(from, to, -1);
    const forward = shiftRange(back.from, back.to, 1);

    expect(matchPreset(back.from, back.to)).toBe("custom");
    expect(matchPreset(forward.from, forward.to)).toBe("7d");
  });
});
