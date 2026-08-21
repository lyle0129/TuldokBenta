// utils/format.js
// Display formatting shared by the sale lists and pages.
//
// Currency was formatted inline at every call site, which is how the closed
// sales list ended up printing "$" while the rest of the app printed "₱".

/** Peso amount, always two decimals. Tolerates strings — prices arrive as NUMERIC from Postgres. */
export const formatCurrency = (value) => `₱${(Number(value) || 0).toFixed(2)}`;

/** "8/17/2026, 2:03:44 PM" — the app's existing toLocaleString() output. */
export const formatDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

/** "Mon, Aug 17, 2026" — for the closed-sales day header. */
export const formatDayLabel = (isoDate) => {
  if (!isoDate) return "—";
  // Parse as local midnight; `new Date("2026-08-17")` would be parsed as UTC
  // and render as the previous day for anyone west of Greenwich.
  const d = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
};

/**
 * "Mon, Aug 17, 2026" for one day, "Aug 13 – Aug 19, 2026" for a span.
 *
 * A range printed as two full day labels ("Thu, Aug 13, 2026 – Wed, Aug 19,
 * 2026") wraps to three lines on a phone, so the weekday and the repeated year
 * are dropped once there is more than one day to name.
 */
export const formatRangeLabel = (fromISO, toISO) => {
  if (!fromISO || !toISO) return "—";
  if (fromISO === toISO) return formatDayLabel(fromISO);

  const short = (isoDate, withYear) => {
    const d = new Date(`${isoDate}T00:00:00`);
    return Number.isNaN(d.getTime())
      ? "—"
      : d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          ...(withYear ? { year: "numeric" } : {}),
        });
  };

  const sameYear = fromISO.slice(0, 4) === toISO.slice(0, 4);
  return `${short(fromISO, !sameYear)} – ${short(toISO, true)}`;
};

/** Sum of a sale's line totals. Freebie lines are price 0, so they contribute nothing. */
export const saleTotal = (sale) =>
  (sale?.items || []).reduce(
    (sum, it) => sum + Number(it.price || 0) * Number(it.qty || 1),
    0
  );
