/**
 * Feature: naming what changed between two versions of a sale
 * Subject: utils/auditItems.js
 *
 * The differ reads a JSONB payload written by a version of the app that may no
 * longer exist, so it carries the same obligation utils/auditChanges.js does:
 * it never throws, because a thrown error here is a blank audit card, and a
 * blank audit card is the failure the whole feature exists to prevent.
 *
 * Its second obligation is narrower and easier to get wrong — an empty result
 * means "I could not summarise this", never "nothing happened". The caller
 * falls back to JSON on an empty result, so a differ that quietly returned []
 * for a real change would hide the change entirely.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { looksLikeSaleLines, diffSaleLines } from "../utils/auditItems";

const line = (name, qty, price, type = "item") => ({
  qty,
  type,
  price,
  [type === "service" ? "service_name" : "item_name"]: name,
});

describe("looksLikeSaleLines — the gate", () => {
  it("accepts an array of sale lines, empty included", () => {
    expect(looksLikeSaleLines([])).toBe(true);
    expect(looksLikeSaleLines([line("Plastic", 1, 0)])).toBe(true);
    expect(looksLikeSaleLines([line("Wash", 1, 60, "service")])).toBe(true);
  });

  it("rejects anything else, so it renders the old way instead", () => {
    for (const value of [null, undefined, {}, "items", 3, [{}], [{ qty: 1 }], [1, 2]]) {
      expect(looksLikeSaleLines(value)).toBe(false);
    }
  });
});

describe("diffSaleLines never throws", () => {
  it("survives arbitrary input on either side", () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (before, after) => {
        expect(Array.isArray(diffSaleLines(before, after))).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  it("survives arrays of arbitrary objects", () => {
    fc.assert(
      fc.property(
        fc.array(fc.dictionary(fc.string(), fc.anything())),
        fc.array(fc.dictionary(fc.string(), fc.anything())),
        (before, after) => {
          for (const entry of diffSaleLines(before, after)) {
            expect(typeof entry.name).toBe("string");
            expect(Number.isFinite(entry.qtyBefore)).toBe(true);
            expect(Number.isFinite(entry.qtyAfter)).toBe(true);
          }
        }
      )
    );
  });
});

describe("what it reports", () => {
  it("says nothing about the lines that did not change", () => {
    const items = [line("Full Service", 1, "170.00", "service"), line("Plastic", 1, 0)];
    expect(diffSaleLines(items, items)).toEqual([]);
  });

  it("reports an addition, a removal and a quantity change", () => {
    const before = [line("Plastic", 1, 0), line("Fabcon", 1, 0)];
    const after = [line("Plastic", 2, 0), line("Surf", 1, "15.00")];

    expect(diffSaleLines(before, after)).toEqual([
      expect.objectContaining({ change: "qty", name: "Plastic", qtyBefore: 1, qtyAfter: 2 }),
      expect.objectContaining({ change: "removed", name: "Fabcon", qtyBefore: 1 }),
      expect.objectContaining({ change: "added", name: "Surf", qtyAfter: 1 }),
    ]);
  });

  it("reports a price change on an otherwise identical line", () => {
    const [entry] = diffSaleLines([line("Plastic", 1, 0)], [line("Plastic", 1, "5.00")]);

    expect(entry).toMatchObject({
      change: "qty",
      name: "Plastic",
      qtyBefore: 1,
      qtyAfter: 1,
      priceBefore: 0,
      priceAfter: 5,
    });
  });

  it("ignores order, because the cart does", () => {
    const before = [line("Plastic", 1, 0), line("Fabcon", 1, 0)];
    const after = [line("Fabcon", 1, 0), line("Plastic", 1, 0)];
    expect(diffSaleLines(before, after)).toEqual([]);
  });

  it("merges the repeated lines the freebie picker writes", () => {
    // Claiming two of the same freebie writes two rows, not one row of qty 2.
    // Grouped they are one line at qty 2, which is how a person counts them.
    const before = [line("Plastic", 1, 0)];
    const after = [line("Plastic", 1, 0), line("Plastic", 1, 0)];

    expect(diffSaleLines(before, after)).toEqual([
      expect.objectContaining({ change: "qty", name: "Plastic", qtyBefore: 1, qtyAfter: 2 }),
    ]);
  });

  it("keeps a service and an item of the same name apart", () => {
    const before = [line("Fold", 1, 20, "service")];
    const after = [line("Fold", 1, 20)];

    expect(diffSaleLines(before, after)).toEqual([
      expect.objectContaining({ change: "removed", name: "Fold" }),
      expect.objectContaining({ change: "added", name: "Fold" }),
    ]);
  });

  it("names a line that arrived with no name at all", () => {
    const [entry] = diffSaleLines([], [{ qty: 1, item_name: "", price: 0 }]);
    expect(entry.name).toBe("Unnamed");
  });

  it("reports an emptied sale rather than nothing", () => {
    expect(diffSaleLines([line("Plastic", 1, 0)], [])).toEqual([
      expect.objectContaining({ change: "removed", name: "Plastic" }),
    ]);
  });
});
