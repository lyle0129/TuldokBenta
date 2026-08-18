/**
 * Feature: catalog subcategory filter
 * Subject: utils/subcategory.js
 *
 * The sale catalog groups items by a subcategory that lives in the data twice:
 * as a "[Detergent] " name prefix and in item_classification. Only some items
 * have the prefix, so the fallback is what keeps the rest out of a catch-all.
 */
import { describe, it, expect } from "vitest";
import {
  subcategoryOf,
  subcategoryLabel,
  subcategoriesOf,
  matchesSubcategory,
  UNCATEGORIZED,
} from "../utils/subcategory";

// The real catalog, in the admin's sort_order.
const CATALOG = [
  { item_name: "Bleach", item_classification: "bleach" },
  { item_name: "Plastic", item_classification: "Plastic" },
  { item_name: "Spincredible Cologne", item_classification: "Giveaway" },
  { item_name: "Spincredible Laundry Bag", item_classification: "Giveaway" },
  { item_name: "[Detergent] Ariel", item_classification: "Detergent" },
  { item_name: "[Fabcon] Downy Pink", item_classification: "Fabcon" },
];

describe("subcategoryOf", () => {
  it("reads the bracketed prefix when there is one", () => {
    expect(subcategoryOf({ item_name: "[Detergent] Ariel" })).toBe("Detergent");
    expect(subcategoryOf({ item_name: "[Fabcon] Downy Blue" })).toBe("Fabcon");
  });

  it("falls back to the classification when there is no prefix", () => {
    expect(
      subcategoryOf({ item_name: "Bleach", item_classification: "bleach" })
    ).toBe("bleach");
    expect(
      subcategoryOf({
        item_name: "Spincredible Cologne",
        item_classification: "Giveaway",
      })
    ).toBe("Giveaway");
  });

  it("prefers the prefix over the classification when they disagree", () => {
    expect(
      subcategoryOf({
        item_name: "[Fabcon] Surf",
        item_classification: "Detergent",
      })
    ).toBe("Fabcon");
  });

  it("never returns an empty group", () => {
    expect(subcategoryOf({ item_name: "Mystery" })).toBe(UNCATEGORIZED);
    expect(subcategoryOf({ item_name: "Mystery", item_classification: "  " })).toBe(
      UNCATEGORIZED
    );
    expect(subcategoryOf(undefined)).toBe(UNCATEGORIZED);
  });

  it("ignores a bracket that is not a prefix", () => {
    expect(
      subcategoryOf({
        item_name: "Downy [refill]",
        item_classification: "Fabcon",
      })
    ).toBe("Fabcon");
  });
});

describe("subcategoriesOf", () => {
  it("lists each group once, in the order its first item appears", () => {
    // Order matters: it is how the chips inherit the Inventory page's ordering.
    expect(subcategoriesOf(CATALOG)).toEqual([
      "bleach",
      "Plastic",
      "Giveaway",
      "Detergent",
      "Fabcon",
    ]);
  });

  it("treats differently-cased spellings as one group", () => {
    expect(
      subcategoriesOf([
        { item_name: "A", item_classification: "Fabcon" },
        { item_name: "B", item_classification: "fabcon" },
        { item_name: "C", item_classification: "FABCON" },
      ])
    ).toEqual(["Fabcon"]);
  });

  it("covers every item in the real catalog", () => {
    const groups = subcategoriesOf(CATALOG);
    for (const item of CATALOG) {
      expect(groups.some((g) => matchesSubcategory(item, g))).toBe(true);
    }
  });

  it("handles an empty catalog", () => {
    expect(subcategoriesOf()).toEqual([]);
    expect(subcategoriesOf([])).toEqual([]);
  });
});

describe("matchesSubcategory", () => {
  it("matches regardless of case", () => {
    const item = { item_name: "Bleach", item_classification: "bleach" };
    expect(matchesSubcategory(item, "Bleach")).toBe(true);
    expect(matchesSubcategory(item, "bleach")).toBe(true);
    expect(matchesSubcategory(item, "Fabcon")).toBe(false);
  });

  it("selects exactly the items of one group", () => {
    const detergents = CATALOG.filter((i) => matchesSubcategory(i, "Detergent"));
    expect(detergents.map((i) => i.item_name)).toEqual(["[Detergent] Ariel"]);
  });
});

describe("subcategoryLabel", () => {
  it("capitalises the first letter so hand-typed groups line up", () => {
    expect(subcategoryLabel("bleach")).toBe("Bleach");
    expect(subcategoryLabel("Detergent")).toBe("Detergent");
  });

  it("leaves the rest of the spelling alone", () => {
    expect(subcategoryLabel("downy PINK")).toBe("Downy PINK");
    expect(subcategoryLabel("")).toBe("");
  });
});
