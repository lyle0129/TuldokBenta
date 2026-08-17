/**
 * Feature: open/closed sales UX rework
 * Subject: utils/filterSales.js
 *
 * One predicate now backs search on the open-sales list, the closed-sales list
 * and the offline queue, so "search" has to mean the same thing in all three.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { matchesQuery, filterSales } from "../utils/filterSales";

const sale = {
  id: 1,
  invoice_number: "INV-0032",
  paid_using: "gcash",
  items: [
    { type: "item", item_name: "Ariel", qty: 2, price: 50 },
    {
      type: "service",
      service_name: "Full Service",
      qty: 1,
      price: 180,
      freebies: [{ classification: "Plastic", choices: [{ item: "Eco Bag", qty: 1 }] }],
    },
    {
      type: "item",
      item_name: "Eco Bag",
      qty: 1,
      price: 0,
      is_freebie: true,
      for_service: "Full Service",
    },
  ],
};

describe("matchesQuery", () => {
  it("matches on the invoice number", () => {
    expect(matchesQuery(sale, "0032")).toBe(true);
  });

  it("matches on an item name", () => {
    expect(matchesQuery(sale, "ariel")).toBe(true);
  });

  it("matches on a service name", () => {
    expect(matchesQuery(sale, "full service")).toBe(true);
  });

  it("matches on the payment method", () => {
    expect(matchesQuery(sale, "gcash")).toBe(true);
  });

  it("is case-insensitive both ways", () => {
    expect(matchesQuery(sale, "ARIEL")).toBe(true);
    expect(matchesQuery({ ...sale, invoice_number: "inv-1" }, "INV")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(matchesQuery(sale, "  ariel  ")).toBe(true);
  });

  it("does not match on a derived freebie line", () => {
    // "Eco Bag" only appears as a freebie item; matching it would surface a
    // sale whose own lines contain nothing like the query.
    expect(matchesQuery(sale, "eco bag")).toBe(false);
  });

  it("returns false when nothing matches", () => {
    expect(matchesQuery(sale, "downy")).toBe(false);
  });

  it("treats a blank query as matching everything", () => {
    expect(matchesQuery(sale, "")).toBe(true);
    expect(matchesQuery(sale, "   ")).toBe(true);
    expect(matchesQuery(sale, undefined)).toBe(true);
  });

  it("tolerates a sale with no items array", () => {
    expect(matchesQuery({ invoice_number: "INV-1" }, "zzz")).toBe(false);
    expect(matchesQuery({ invoice_number: "INV-1" }, "inv")).toBe(true);
  });

  it("tolerates a sale with no payment method", () => {
    expect(matchesQuery({ invoice_number: "INV-1", items: [] }, "cash")).toBe(false);
  });
});

describe("filterSales", () => {
  it("returns the same array reference when the query is blank", () => {
    const sales = [sale];
    expect(filterSales(sales, "")).toBe(sales);
    expect(filterSales(sales, "   ")).toBe(sales);
  });

  it("keeps only matching sales", () => {
    const other = { id: 2, invoice_number: "INV-0099", items: [] };
    expect(filterSales([sale, other], "0032")).toEqual([sale]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterSales([sale], "nonexistent")).toEqual([]);
  });

  it("never returns more sales than it was given", () => {
    fc.assert(
      fc.property(fc.string(), (query) => {
        expect(filterSales([sale], query).length).toBeLessThanOrEqual(1);
      })
    );
  });

  it("every result satisfies the predicate", () => {
    const sales = [sale, { id: 2, invoice_number: "INV-0099", items: [] }];
    fc.assert(
      fc.property(fc.string(), (query) => {
        for (const s of filterSales(sales, query)) {
          expect(matchesQuery(s, query)).toBe(true);
        }
      })
    );
  });
});
