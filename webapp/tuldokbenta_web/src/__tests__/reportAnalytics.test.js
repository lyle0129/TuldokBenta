/**
 * Subject: hooks/useReportAnalytics.js
 *
 * The report answers two different questions off one set of sales, and they key
 * off different dates:
 *
 *   money   — when it arrived   (paid_at)
 *   stock   — when it left      (created_at)
 *
 * `lines` is the stock question. It used to be built from `collected`, so a week
 * where customers were slow to settle read as though nothing had left the shop,
 * and the items that actually went out were missing from "Items used".
 */
import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useReportAnalytics } from "../hooks/useReportAnalytics";

const FROM = "2026-08-01";
const TO = "2026-08-31";

/** Closed: created inside the range, paid inside it too. */
const paidInRange = {
  id: 1,
  invoice_number: "INV-0001",
  created_at: "2026-08-10T02:00:00Z",
  paid_at: "2026-08-11T02:00:00Z",
  paid_using: "cash",
  items: [{ type: "item", item_name: "Ariel", qty: 2, price: 50 }],
};

/** Open: created inside the range, never settled. Its stock is gone all the same. */
const bookedUnpaid = {
  id: 2,
  invoice_number: "INV-0002",
  created_at: "2026-08-12T02:00:00Z",
  paid_at: null,
  paid_using: null,
  items: [{ type: "item", item_name: "Champion", qty: 3, price: 40 }],
};

/** Closed: written before the range, collected inside it. */
const carriedOver = {
  id: 3,
  invoice_number: "INV-0003",
  created_at: "2026-07-20T02:00:00Z",
  paid_at: "2026-08-05T02:00:00Z",
  paid_using: "gcash",
  items: [{ type: "item", item_name: "Bleach", qty: 1, price: 30 }],
};

const analyticsFor = (windowSales, openSales = []) =>
  renderHook(() =>
    useReportAnalytics({ windowSales, openSales, from: FROM, to: TO })
  ).result.current;

const unitsOf = (lines, name) =>
  lines.items.find((i) => i.name === name)?.qty ?? 0;

describe("useReportAnalytics — lines follow booking, not collection", () => {
  it("counts stock from a sale booked in the range but never paid", () => {
    const { lines } = analyticsFor([paidInRange], [bookedUnpaid]);

    // Three Champion left the shelf the moment the sale was opened.
    expect(unitsOf(lines, "Champion")).toBe(3);
    expect(unitsOf(lines, "Ariel")).toBe(2);
  });

  it("leaves out stock that left before the range, even if paid inside it", () => {
    const { lines } = analyticsFor([paidInRange, carriedOver]);

    // The Bleach went out in July. August's shelf did not move for it.
    expect(unitsOf(lines, "Bleach")).toBe(0);
    expect(unitsOf(lines, "Ariel")).toBe(2);
  });

  it("reports a range where nothing was collected but stock still moved", () => {
    // The case that made this wrong: a slow-paying week read as an empty one.
    const { collected, booked, lines } = analyticsFor([], [bookedUnpaid]);

    expect(collected.total).toBe(0);
    expect(booked.total).toBe(120);
    expect(unitsOf(lines, "Champion")).toBe(3);
  });

  it("adds its revenue up to Booked, not Collected", () => {
    const { collected, booked, lines } = analyticsFor(
      [paidInRange, carriedOver],
      [bookedUnpaid]
    );

    expect(lines.totals.itemRevenue).toBe(booked.total);
    expect(lines.totals.itemRevenue).not.toBe(collected.total);
  });

  it("counts a freebie's stock as it does anything else that left", () => {
    const withFreebie = {
      ...bookedUnpaid,
      items: [
        { type: "service", service_name: "Full Service", qty: 1, price: 170 },
        { type: "item", item_name: "Plastic", qty: 1, price: 0 },
      ],
    };
    const { lines } = analyticsFor([], [withFreebie]);

    expect(unitsOf(lines, "Plastic")).toBe(1);
    expect(lines.totals.freebieQty).toBe(1);
  });
});

describe("useReportAnalytics — payments still follow collection", () => {
  it("counts only money that arrived, since an unpaid sale has no method", () => {
    const { payments } = analyticsFor([paidInRange, carriedOver], [bookedUnpaid]);

    expect(payments.cash).toMatchObject({ count: 1, total: 100 });
    expect(payments.gcash).toMatchObject({ count: 1, total: 30 });
    // No empty-code bucket invented for the sale nobody has paid for yet.
    expect(payments[""]).toBeUndefined();
  });
});
