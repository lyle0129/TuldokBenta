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
  lineBreakdown,
  paymentBreakdown,
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
