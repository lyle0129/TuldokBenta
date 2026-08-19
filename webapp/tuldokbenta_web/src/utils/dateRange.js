// utils/dateRange.js
// Turns a calendar day into the timestamp range the sales API expects.
//
// The conversion was inlined in useSales.loadSales, which is why the only day
// anyone could ever query was today. The tricky part is that the user picks a
// day in *local* time while `paid_at` is stored in UTC, so the boundaries have
// to be built locally and then converted.

/** Today as "YYYY-MM-DD" in the user's own timezone. */
export const todayISODate = () => toISODate(new Date());

/** A Date → "YYYY-MM-DD" using local calendar fields, never toISOString(). */
export const toISODate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * The two instants a span of local days covers.
 *
 * `new Date("2026-08-17T00:00:00")` (no trailing Z) is parsed as local time,
 * which is exactly what's wanted — the day boundary is the shop's midnight, not
 * Greenwich's. The shop is in UTC+8 while the sale timestamps are stored in
 * UTC, so this conversion is the whole reason a "day" lands where it should.
 *
 * The end is 23:59:59.999, not 23:59:59: the columns keep milliseconds, and the
 * server compares with an inclusive BETWEEN, so trimming to whole seconds would
 * silently drop anything sold in the last second of the day.
 *
 * @param {string} fromISO "YYYY-MM-DD", inclusive
 * @param {string} toISO   "YYYY-MM-DD", inclusive
 * @returns {{ start: Date, end: Date }}
 */
export const localRangeBounds = (fromISO, toISO) => ({
  start: new Date(`${fromISO}T00:00:00.000`),
  end: new Date(`${toISO}T23:59:59.999`),
});

/**
 * The same span, formatted the way the API parses it.
 *
 * Derived from localRangeBounds so a range filtered in the browser and the same
 * range filtered by the server cannot describe different windows.
 *
 * @returns {{ lowdate: string, highdate: string }} "YYYY-MM-DD HH:MM:SS.mmm" in UTC
 */
export const rangeBounds = (fromISO, toISO) => {
  const format = (d) => d.toISOString().slice(0, 23).replace("T", " ");
  const { start, end } = localRangeBounds(fromISO, toISO);
  return { lowdate: format(start), highdate: format(end) };
};

/**
 * The UTC range covering one local day.
 *
 * @param {string} isoDate "YYYY-MM-DD"
 * @returns {{ lowdate: string, highdate: string }}
 */
export const dayRange = (isoDate) => rangeBounds(isoDate, isoDate);

/**
 * Moves an ISO date by whole days.
 *
 * Uses setDate rather than adding 86,400,000ms so a DST transition doesn't
 * land the result on the same or a skipped calendar day.
 */
export const shiftDay = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
};

/** The ranges the report toolbar offers, in the order it renders them. */
export const RANGE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "month", label: "This month" },
];

/**
 * A preset's inclusive `{ from, to }` day pair, always ending today.
 *
 * Built from local calendar fields throughout. The old quick-filter derived
 * its date from `toISOString()`, so in UTC+8 every morning before 08:00 it
 * selected *yesterday* — the exact bug this module exists to prevent.
 *
 * @param {string} preset one of RANGE_PRESETS' ids
 */
export const presetRange = (preset) => {
  const to = todayISODate();
  switch (preset) {
    // 7 and 30 days *including* today, so "Last 7 days" spans a week, not eight.
    case "7d":
      return { from: shiftDay(to, -6), to };
    case "30d":
      return { from: shiftDay(to, -29), to };
    case "month": {
      const d = new Date(`${to}T00:00:00`);
      d.setDate(1);
      return { from: toISODate(d), to };
    }
    case "today":
    default:
      return { from: to, to };
  }
};
