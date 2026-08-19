/**
 * Feature: one date-attribution rule for the report
 * Subject: utils/reportMetrics.js
 *
 * The page this replaced held three disagreeing answers to "which date does a
 * closed sale belong to": the Closed tab used created_at, the Overview cards
 * used `paid_at OR created_at`, and the API used paid_at. The rule is now
 * single and stated once —
 *
 *     open sales are dated by created_at, closed sales by paid_at
 *
 * — so these tests pin it, plus the two crashes the old grouping carried.
 */
import { describe, it, expect } from "vitest";
import {
  bucketKey,
  isPaidAsOf,
  lineBreakdown,
  outstandingAsOf,
  paymentBreakdown,
  splitBy,
  summarize,
  trendSeries,
} from "../utils/reportMetrics";

/** A sale worth `price`, opened on `created` and paid on `paid` (local times). */
const sale = ({ id = 1, created, paid = null, price = 100, items = null }) => ({
  id,
  invoice_number: `INV-${id}`,
  created_at: created,
  paid_at: paid,
  paid_using: paid ? "cash" : null,
  items: items ?? [{ type: "service", service_name: "Wash", price, qty: 1 }],
});

describe("summarize", () => {
  it("totals the line amounts across sales", () => {
    const { count, total } = summarize([
      sale({ id: 1, created: "2026-08-17T09:00:00", price: 100 }),
      sale({ id: 2, created: "2026-08-17T10:00:00", price: 50 }),
    ]);
    expect(count).toBe(2);
    expect(total).toBe(150);
  });

  /** Prices arrive as strings from Postgres NUMERIC; concatenating them was a
   *  live risk in the old inline reducers. */
  it("adds string prices as numbers", () => {
    const { total } = summarize([
      sale({ id: 1, created: "2026-08-17T09:00:00", items: [{ price: "20.50", qty: "2" }] }),
    ]);
    expect(total).toBe(41);
  });

  it("reports an average of 0 for an empty set rather than NaN", () => {
    expect(summarize([])).toEqual({ count: 0, total: 0, average: 0 });
  });
});

describe("bucketKey", () => {
  /**
   * The chart used to key on `toISOString().split("T")[0]` — UTC days — while
   * the filters selecting those sales used local days, so a late-evening sale
   * east of Greenwich landed in the next day's column.
   */
  it("uses the local calendar day, not the UTC one", () => {
    // 23:30 local on the 17th. In any zone ahead of UTC this instant is still
    // the 17th locally but may already be the 18th in UTC.
    const late = new Date(2026, 7, 17, 23, 30);
    expect(bucketKey(late, "daily")).toBe("2026-08-17");
  });

  it("groups by month and year", () => {
    const d = new Date(2026, 7, 17, 12);
    expect(bucketKey(d, "monthly")).toBe("2026-08");
    expect(bucketKey(d, "yearly")).toBe("2026");
  });

  it("snaps a week to its Sunday", () => {
    // 2026-08-17 is a Monday; its week starts Sunday the 16th.
    expect(bucketKey(new Date(2026, 7, 17, 12), "weekly")).toBe("2026-08-16");
  });

  it("returns null for a missing or unparseable timestamp", () => {
    expect(bucketKey(null)).toBeNull();
    expect(bucketKey("not a date")).toBeNull();
  });
});

describe("trendSeries — the attribution rule", () => {
  // Opened Monday, paid Tuesday. This is the case the whole change is about.
  const crossDay = sale({
    id: 1,
    created: "2026-08-17T09:00:00",
    paid: "2026-08-18T14:00:00",
    price: 100,
  });

  it("credits collected to the day it was paid and booked to the day it was opened", () => {
    const trend = trendSeries({
      collected: [crossDay],
      booked: [crossDay],
      granularity: "daily",
    });

    const monday = trend.find((row) => row.period === "2026-08-17");
    const tuesday = trend.find((row) => row.period === "2026-08-18");

    expect(monday.booked).toBe(100);
    expect(monday.collected).toBe(0);

    expect(tuesday.collected).toBe(100);
    expect(tuesday.booked).toBe(0);
  });

  it("counts the sale once on each side, never twice on one", () => {
    const trend = trendSeries({
      collected: [crossDay],
      booked: [crossDay],
      granularity: "daily",
    });
    expect(trend.reduce((sum, row) => sum + row.paidCount, 0)).toBe(1);
    expect(trend.reduce((sum, row) => sum + row.openedCount, 0)).toBe(1);
  });

  /**
   * The crash: the old grouping built its buckets differently on the two paths
   * and the payment path omitted the payment tally, so the first sale paid in a
   * period nothing was created in threw a TypeError — the ordinary cross-day
   * payment, and every "paid today, opened last week" sale.
   */
  it("survives a period that has payments but no creations", () => {
    expect(() =>
      trendSeries({
        collected: [crossDay],
        booked: [], // nothing opened in the window at all
        granularity: "daily",
      })
    ).not.toThrow();

    const trend = trendSeries({ collected: [crossDay], booked: [] });
    expect(trend).toHaveLength(1);
    expect(trend[0]).toMatchObject({
      period: "2026-08-18",
      collected: 100,
      paidCount: 1,
      booked: 0,
      openedCount: 0,
    });
  });

  /**
   * A quiet day still owes whatever it owed. Deriving buckets from activity
   * alone would leave a hole in the outstanding line wherever trade stopped.
   */
  it("seeds a bucket for every day in the range, even ones with no sales", () => {
    const trend = trendSeries({
      collected: [],
      booked: [],
      from: "2026-08-17",
      to: "2026-08-19",
    });
    expect(trend.map((row) => row.period)).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
    ]);
  });

  it("never seeds a bucket past the end of the range", () => {
    const trend = trendSeries({ collected: [], booked: [], from: "2026-08-17", to: "2026-08-18" });
    expect(trend.map((row) => row.period)).not.toContain("2026-08-19");
  });

  it("tracks outstanding as the balance owed at each day's end", () => {
    const owed = [crossDay]; // opened the 17th, paid the 18th
    const trend = trendSeries({
      collected: [crossDay],
      booked: [crossDay],
      owedSource: owed,
      from: "2026-08-16",
      to: "2026-08-19",
    });

    const on = (day) => trend.find((row) => row.period === day);
    expect(on("2026-08-16").outstanding).toBe(0); // did not exist yet
    expect(on("2026-08-17").outstanding).toBe(100); // opened, unpaid
    expect(on("2026-08-18").outstanding).toBe(0); // paid during the 18th
    expect(on("2026-08-19").outstanding).toBe(0);
    expect(on("2026-08-17").owedCount).toBe(1);
  });

  it("skips sales whose date is missing instead of bucketing them under null", () => {
    const trend = trendSeries({
      collected: [sale({ id: 2, created: "2026-08-17T09:00:00", paid: null })],
      booked: [],
    });
    expect(trend).toEqual([]);
  });

  it("returns buckets in chronological order", () => {
    const trend = trendSeries({
      collected: [],
      booked: [
        sale({ id: 1, created: "2026-08-19T09:00:00" }),
        sale({ id: 2, created: "2026-08-17T09:00:00" }),
        sale({ id: 3, created: "2026-08-18T09:00:00" }),
      ],
    });
    expect(trend.map((row) => row.period)).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Point-in-time settlement — the heart of the report
// ---------------------------------------------------------------------------
describe("isPaidAsOf", () => {
  const paidOn20th = sale({ created: "2026-08-10T09:00:00", paid: "2026-08-20T14:00:00" });

  it("is false before the payment, true after it", () => {
    expect(isPaidAsOf(paidOn20th, new Date("2026-08-15T23:59:59.999"))).toBe(false);
    expect(isPaidAsOf(paidOn20th, new Date("2026-08-25T23:59:59.999"))).toBe(true);
  });

  it("counts a payment made exactly at the boundary as settled", () => {
    expect(isPaidAsOf(paidOn20th, new Date("2026-08-20T14:00:00"))).toBe(true);
  });

  it("is false for a sale that was never paid", () => {
    expect(isPaidAsOf(sale({ created: "2026-08-10T09:00:00" }), new Date())).toBe(false);
  });
});

describe("outstandingAsOf", () => {
  // Opened the 10th, paid the 20th. It was owed for ten days in between.
  const lateBloomer = sale({ id: 1, created: "2026-08-10T09:00:00", paid: "2026-08-20T14:00:00" });
  const stillOpen = sale({ id: 2, created: "2026-08-12T09:00:00" });
  const openedLater = sale({ id: 3, created: "2026-08-18T09:00:00" });
  const all = [lateBloomer, stillOpen, openedLater];

  const asOf = (iso) => outstandingAsOf(all, new Date(iso)).map((s) => s.id);

  /**
   * The property the whole feature exists for. Asking "is it unpaid *now*"
   * would say this sale was never outstanding on the 15th, and would silently
   * change the 15th's figures the moment it was paid.
   */
  it("counts a sale that was owed then, even though it is paid now", () => {
    expect(asOf("2026-08-15T23:59:59.999")).toContain(1);
  });

  it("stops counting it once the payment date has passed", () => {
    expect(asOf("2026-08-25T23:59:59.999")).not.toContain(1);
  });

  /** Idempotence, stated directly: the answer for a past day never moves. */
  it("gives the same answer for a past day no matter when it is asked", () => {
    const fifteenth = asOf("2026-08-15T23:59:59.999");
    // Re-derive after "time passes" and more sales are settled.
    const later = outstandingAsOf(
      [...all, sale({ id: 4, created: "2026-09-01T09:00:00", paid: "2026-09-02T09:00:00" })],
      new Date("2026-08-15T23:59:59.999")
    ).map((s) => s.id);
    expect(later).toEqual(fifteenth);
  });

  it("excludes sales that did not exist yet — no phantom future", () => {
    expect(asOf("2026-08-15T23:59:59.999")).not.toContain(3);
  });

  it("includes a sale that is still unpaid", () => {
    expect(asOf("2026-08-15T23:59:59.999")).toContain(2);
  });

  it("is empty before anything was opened", () => {
    expect(asOf("2026-08-01T00:00:00")).toEqual([]);
  });
});

describe("splitBy", () => {
  it("partitions exhaustively, so the halves sum to the whole", () => {
    const sales = [
      sale({ id: 1, price: 100, created: "2026-08-17T09:00:00" }),
      sale({ id: 2, price: 50, created: "2026-08-17T10:00:00" }),
      sale({ id: 3, price: 25, created: "2026-08-17T11:00:00" }),
    ];
    const { yes, no } = splitBy(sales, (s) => s.id === 2);

    expect(yes).toHaveLength(1);
    expect(no).toHaveLength(2);
    expect(summarize(yes).total + summarize(no).total).toBe(summarize(sales).total);
  });
});

describe("paymentBreakdown", () => {
  it("tallies count and total per raw code", () => {
    const breakdown = paymentBreakdown([
      { paid_using: "cash", items: [{ price: 100, qty: 1 }] },
      { paid_using: "cash", items: [{ price: 50, qty: 1 }] },
      { paid_using: "gcash", items: [{ price: 25, qty: 1 }] },
    ]);
    expect(breakdown.cash).toEqual({ count: 2, total: 150 });
    expect(breakdown.gcash).toEqual({ count: 1, total: 25 });
  });
});

describe("lineBreakdown", () => {
  const mixed = [
    {
      items: [
        { type: "service", service_name: "Wash", price: 200, qty: 1 },
        { type: "item", item_name: "SODA Coke", price: 30, qty: 2 },
        // Tagged freebie — the flag is authoritative.
        { type: "item", item_name: "SODA Sprite", price: 0, qty: 1, is_freebie: true },
        // Untagged but priced at 0 — a sale predating the flag.
        { type: "item", item_name: "SNACK Chips", price: 0, qty: 3 },
      ],
    },
  ];

  it("separates service revenue from item revenue", () => {
    const { totals } = lineBreakdown(mixed);
    expect(totals.serviceRevenue).toBe(200);
    expect(totals.itemRevenue).toBe(60);
    expect(totals.itemQty).toBe(2);
  });

  /** The old code classified freebies by `price > 0` alone; the tag came later
   *  and sales predating it only have the price to go on, so both must count. */
  it("counts a tagged freebie and an untagged zero-priced line as free", () => {
    const { totals } = lineBreakdown(mixed);
    expect(totals.freebieQty).toBe(4); // 1 Sprite + 3 Chips
    expect(totals.uniqueFreebies).toBe(2);
  });

  it("counts unique paid items without double-counting freebies", () => {
    const { totals } = lineBreakdown(mixed);
    expect(totals.uniqueItems).toBe(1); // only SODA Coke was sold
  });

  it("groups items by the leading category word", () => {
    const { itemGroups } = lineBreakdown(mixed);
    const soda = itemGroups.find((g) => g.category === "SODA");
    expect(soda.qty).toBe(3); // 2 Coke + 1 free Sprite: stock moved either way
    expect(soda.total).toBe(60); // but only the Coke earned
    expect(soda.uniqueItems).toBe(2);
  });

  it("sorts services by revenue, highest first", () => {
    const { services } = lineBreakdown([
      { items: [{ type: "service", service_name: "Small", price: 50, qty: 1 }] },
      { items: [{ type: "service", service_name: "Big", price: 500, qty: 1 }] },
    ]);
    expect(services.map((s) => s.name)).toEqual(["Big", "Small"]);
  });

  it("handles a sale with no items", () => {
    expect(() => lineBreakdown([{ items: null }])).not.toThrow();
  });
});
