// utils/reportMetrics.js
// The report's arithmetic, kept free of React so it can be tested directly.
//
// Replaces useTodaysAnalytics and useOverviewAnalytics, which between them held
// three disagreeing answers to "which date does a closed sale belong to". The
// rule here is stated once and applied everywhere:
//
//   open sales are dated by created_at, closed sales by paid_at.
//
// So the two headline totals are different questions, not two halves of one:
//   collected — closed sales paid in the range. The cash that arrived.
//   booked    — any sale created in the range. The business written.
// They overlap by design and must never be added together.

import { shiftDay, toISODate } from "./dateRange";
import { saleTotal } from "./format";
import { isFreebieLine } from "./buildSaleItems";

/**
 * A line that earns nothing: either tagged as a freebie, or priced at zero.
 *
 * The tag is authoritative for anything sold since it was introduced, but sales
 * predating it only have the price to go on — the old reports keyed entirely
 * off `price > 0`, so dropping that test would reclassify historic freebies as
 * paid items worth ₱0.
 */
const isFreeLine = (line) => isFreebieLine(line) || Number(line?.price || 0) === 0;

const lineQty = (line) => Number(line?.qty || 1);
const lineRevenue = (line) => Number(line?.price || 0) * lineQty(line);

/** Count, total and mean of a set of sales. Average is 0 for an empty set. */
export const summarize = (sales = []) => {
  const count = sales.length;
  const total = sales.reduce((sum, sale) => sum + saleTotal(sale), 0);
  return { count, total, average: count === 0 ? 0 : total / count };
};

/**
 * The bucket a timestamp falls in, as a sortable key.
 *
 * Built from *local* calendar fields. The chart used to key on
 * `toISOString().split("T")[0]` — UTC days — while the filters choosing those
 * sales used local days, so a late-evening sale in UTC+8 landed in the next
 * day's column.
 *
 * @param {Date|string} value
 * @param {"daily"|"weekly"|"monthly"|"yearly"} granularity
 * @returns {string|null} null when the timestamp is missing or unparseable
 */
export const bucketKey = (value, granularity = "daily") => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  switch (granularity) {
    case "yearly":
      return String(date.getFullYear());
    case "monthly":
      return toISODate(date).slice(0, 7);
    case "weekly": {
      // Sunday-start, matching the week the old grouping used.
      const start = new Date(date);
      start.setDate(date.getDate() - date.getDay());
      return toISODate(start);
    }
    case "daily":
    default:
      return toISODate(date);
  }
};

/** Human label for a bucket key, e.g. "Aug 17" / "Aug 2026" / "2026". */
export const bucketLabel = (key, granularity = "daily") => {
  if (!key) return "—";
  switch (granularity) {
    case "yearly":
      return key;
    case "monthly": {
      const [year, month] = key.split("-");
      return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(
        undefined,
        { year: "numeric", month: "short" }
      );
    }
    case "weekly":
    case "daily":
    default:
      // Parsed as local midnight; `new Date("2026-08-17")` is UTC and would
      // render as the previous day for anyone west of Greenwich.
      return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
  }
};

/**
 * Whether a sale was settled by `asOf` — the one definition of "paid by then".
 *
 * Deliberately not "has a paid_at": a sale paid *after* the moment being asked
 * about was still owed at that moment. Every as-of figure on the report goes
 * through this, so they cannot drift apart.
 */
export const isPaidAsOf = (sale, asOf) => {
  if (!sale?.paid_at) return false;
  const paid = new Date(sale.paid_at);
  return !Number.isNaN(paid.getTime()) && paid <= asOf;
};

/**
 * The sales still owed at a given moment: created by then, not yet paid by then.
 *
 * This is what makes a historical report stable. "Unpaid right now" would say a
 * sale opened on the 10th and paid on the 20th was never outstanding on the
 * 15th, and would quietly change the 15th's figures the moment it was paid.
 * Asking the question *as of* the 15th gives the same answer forever.
 *
 * `created_at <= asOf` is also what keeps a range free of bookings that did not
 * exist yet.
 */
export const outstandingAsOf = (sales = [], asOf) =>
  sales.filter((sale) => {
    const created = new Date(sale.created_at);
    if (Number.isNaN(created.getTime()) || created > asOf) return false;
    return !isPaidAsOf(sale, asOf);
  });

/**
 * Partitions on a predicate. Returns both halves, so a split is always
 * exhaustive by construction and the parts provably sum to the whole.
 */
export const splitBy = (sales = [], test) => {
  const yes = [];
  const no = [];
  for (const sale of sales) (test(sale) ? yes : no).push(sale);
  return { yes, no };
};

/** An empty bucket, complete. Every field exists from the moment it is created. */
const emptyBucket = (period) => ({
  period,
  collected: 0,
  booked: 0,
  outstanding: 0,
  paidCount: 0,
  openedCount: 0,
  owedCount: 0,
});

/**
 * Chart rows plotting collected, booked and outstanding over time.
 *
 * `collected` is bucketed by paid_at and `booked` by created_at, so a sale
 * opened Monday and paid Tuesday raises Monday's booked line and Tuesday's
 * collected line. Those two are flows — money moved during the period.
 * `outstanding` is a stock, evaluated once at the end of each bucket, which is
 * why it gets its own axis when drawn.
 *
 * Buckets are seeded for every day in [from, to] rather than only where a sale
 * happened. A quiet day still owes whatever it owed, so deriving buckets from
 * activity alone would break the outstanding line wherever trade stopped.
 *
 * They are seeded through emptyBucket() alone. The previous version built them
 * differently on the two paths and the payment path omitted its payment tally,
 * so the first sale paid in a period nothing was created in threw a TypeError —
 * the ordinary cross-day payment.
 *
 * @param {object}   params
 * @param {object[]} params.collected   sales paid inside the range
 * @param {object[]} params.booked      sales created inside the range
 * @param {object[]} params.owedSource  every sale that could still be owed —
 *                                      open sales plus the closed-sales window
 * @param {string}   params.from        "YYYY-MM-DD"
 * @param {string}   params.to          "YYYY-MM-DD"
 * @param {string}   params.granularity daily | weekly | monthly | yearly
 */
export const trendSeries = ({
  collected = [],
  booked = [],
  owedSource = [],
  from,
  to,
  granularity = "daily",
} = {}) => {
  const buckets = new Map();
  // Kept beside the buckets rather than on them: it is scaffolding for the
  // outstanding pass, not something the chart should receive.
  const lastDayOf = new Map();

  const bucketFor = (key) => {
    if (!buckets.has(key)) buckets.set(key, emptyBucket(key));
    return buckets.get(key);
  };

  // Walk the range a day at a time so every bucket exists, and remember the
  // last day each one covers. That day *is* the bucket's end — no calendar
  // arithmetic needed, and a bucket can never reach past `to`, which is what
  // keeps days that have not happened yet out of the series.
  if (from && to) {
    for (let day = from; day <= to; day = shiftDay(day, 1)) {
      const key = bucketKey(`${day}T12:00:00`, granularity);
      if (!key) break;
      bucketFor(key);
      lastDayOf.set(key, day);
    }
  }

  for (const sale of collected) {
    const key = bucketKey(sale.paid_at, granularity);
    if (!key) continue;
    const bucket = bucketFor(key);
    bucket.collected += saleTotal(sale);
    bucket.paidCount += 1;
  }

  for (const sale of booked) {
    const key = bucketKey(sale.created_at, granularity);
    if (!key) continue;
    const bucket = bucketFor(key);
    bucket.booked += saleTotal(sale);
    bucket.openedCount += 1;
  }

  for (const [key, bucket] of buckets) {
    const lastDay = lastDayOf.get(key);
    if (!lastDay) continue;
    const owed = outstandingAsOf(owedSource, new Date(`${lastDay}T23:59:59.999`));
    bucket.outstanding = owed.reduce((sum, sale) => sum + saleTotal(sale), 0);
    bucket.owedCount = owed.length;
  }

  return [...buckets.values()]
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((bucket) => ({
      ...bucket,
      displayPeriod: bucketLabel(bucket.period, granularity),
    }));
};

/**
 * Money taken per payment method, keyed by the raw `paid_using` code.
 *
 * Codes are left raw so resolveMethod() can label them at render time; a method
 * deleted from the admin list still has sales, and they must stay countable.
 */
export const paymentBreakdown = (closedSales = []) => {
  const breakdown = {};
  for (const sale of closedSales) {
    const code = sale.paid_using || "";
    if (!breakdown[code]) breakdown[code] = { count: 0, total: 0 };
    breakdown[code].count += 1;
    breakdown[code].total += saleTotal(sale);
  }
  return breakdown;
};

/**
 * What was actually sold, in one pass over every line.
 *
 * @returns {{
 *   services: {name: string, qty: number, total: number}[],
 *   items: {name: string, qty: number, total: number}[],
 *   itemGroups: {category: string, qty: number, total: number, uniqueItems: number}[],
 *   totals: object
 * }}
 */
export const lineBreakdown = (sales = []) => {
  const services = new Map();
  const items = new Map();
  const groups = new Map();

  let serviceQty = 0;
  let serviceRevenue = 0;
  let itemQty = 0;
  let itemRevenue = 0;
  let freebieQty = 0;
  // Tracked as two sets rather than one count each, because an item given away
  // on one sale and sold on another is genuinely unique to both tallies.
  const paidNames = new Set();
  const freebieNames = new Set();

  const bump = (map, key, qty, revenue) => {
    if (!map.has(key)) map.set(key, { qty: 0, total: 0 });
    const entry = map.get(key);
    entry.qty += qty;
    entry.total += revenue;
  };

  for (const sale of sales) {
    for (const line of sale.items || []) {
      const qty = lineQty(line);
      const revenue = lineRevenue(line);

      if (line.type === "service") {
        serviceQty += qty;
        serviceRevenue += revenue;
        bump(services, line.service_name, qty, revenue);
        continue;
      }
      if (line.type !== "item") continue;

      const name = line.item_name;

      if (isFreeLine(line)) {
        freebieQty += qty;
        freebieNames.add(name);
      } else {
        itemQty += qty;
        itemRevenue += revenue;
        paidNames.add(name);
      }

      // Freebies move stock too, so they belong in the item and category
      // tallies — they just contribute no revenue.
      bump(items, name, qty, revenue);

      // Items are named "[CATEGORY] rest", so the first word is the category.
      const spaceIndex = name?.indexOf(" ") ?? -1;
      const category = spaceIndex > 0 ? name.slice(0, spaceIndex) : name;
      if (!groups.has(category)) {
        groups.set(category, { qty: 0, total: 0, names: new Set() });
      }
      const group = groups.get(category);
      group.qty += qty;
      group.total += revenue;
      group.names.add(name);
    }
  }

  const toSortedRows = (map) =>
    [...map]
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total || b.qty - a.qty);

  return {
    services: toSortedRows(services),
    items: toSortedRows(items),
    itemGroups: [...groups]
      .map(([category, data]) => ({
        category,
        qty: data.qty,
        total: data.total,
        uniqueItems: data.names.size,
      }))
      .sort((a, b) => b.qty - a.qty),
    totals: {
      serviceQty,
      serviceRevenue,
      uniqueServices: services.size,
      itemQty,
      itemRevenue,
      uniqueItems: paidNames.size,
      freebieQty,
      uniqueFreebies: freebieNames.size,
    },
  };
};
