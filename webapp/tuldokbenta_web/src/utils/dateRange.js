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
 * The UTC range covering one local day, formatted the way the API parses it.
 *
 * @param {string} isoDate "YYYY-MM-DD"
 * @returns {{ lowdate: string, highdate: string }} "YYYY-MM-DD HH:MM:SS" in UTC
 */
export const dayRange = (isoDate) => {
  const format = (d) => d.toISOString().slice(0, 19).replace("T", " ");
  return {
    // `new Date("2026-08-17T00:00:00")` (no trailing Z) is parsed as local time,
    // which is exactly what's wanted — the day boundary is the user's midnight.
    lowdate: format(new Date(`${isoDate}T00:00:00`)),
    highdate: format(new Date(`${isoDate}T23:59:59`)),
  };
};

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
