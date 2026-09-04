/**
 * Feature: admin list navigation (pagination, filters, sort)
 * Subject: utils/sortRows.js
 *
 * Shops and Users grew a sort control and a pager. Two behaviours there are
 * easy to get wrong and invisible until someone hits them: an account that has
 * never signed in has a null "last sign-in" and must not float to the top when
 * the arrow flips, and narrowing a filter while standing on page 3 must not
 * leave the admin on a blank page.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { compareValues, sortRows, pageSlice } from "../utils/sortRows";

const by = (key) => (row) => row[key];

describe("compareValues", () => {
  it("orders strings without splitting on case", () => {
    expect(compareValues("apple", "Banana")).toBeLessThan(0);
    expect(compareValues("Banana", "apple")).toBeGreaterThan(0);
    expect(compareValues("apple", "APPLE")).toBe(0);
  });

  it("orders numbers numerically, not lexically", () => {
    expect(compareValues(9, 10)).toBeLessThan(0);
  });

  it("orders numeric strings numerically too", () => {
    // "INV-9" before "INV-10" — the reason `numeric: true` is set.
    expect(compareValues("INV-9", "INV-10")).toBeLessThan(0);
  });

  it("puts true before false, so Active leads", () => {
    expect(compareValues(true, false)).toBeLessThan(0);
  });

  it("sorts null, undefined and empty string last", () => {
    expect(compareValues(null, "anything")).toBeGreaterThan(0);
    expect(compareValues(undefined, "anything")).toBeGreaterThan(0);
    expect(compareValues("", "anything")).toBeGreaterThan(0);
    expect(compareValues("anything", null)).toBeLessThan(0);
  });

  it("treats two blanks as equal", () => {
    expect(compareValues(null, undefined)).toBe(0);
    expect(compareValues(null, "")).toBe(0);
  });
});

describe("sortRows", () => {
  const users = [
    { username: "cara", last_login_at: "2026-03-01" },
    { username: "abe", last_login_at: null },
    { username: "bea", last_login_at: "2026-01-01" },
  ];

  it("sorts ascending by the accessor", () => {
    expect(sortRows(users, by("username"), "asc").map(by("username"))).toEqual([
      "abe",
      "bea",
      "cara",
    ]);
  });

  it("sorts descending by the accessor", () => {
    expect(sortRows(users, by("username"), "desc").map(by("username"))).toEqual([
      "cara",
      "bea",
      "abe",
    ]);
  });

  it("keeps blanks last in both directions", () => {
    const asc = sortRows(users, by("last_login_at"), "asc");
    const desc = sortRows(users, by("last_login_at"), "desc");

    expect(asc.at(-1).username).toBe("abe");
    expect(desc.at(-1).username).toBe("abe");
  });

  it("does not mutate the array handed in", () => {
    // It is React Query's cached array; `Array.prototype.sort` sorts in place.
    const original = [...users];
    sortRows(users, by("username"), "desc");
    expect(users).toEqual(original);
  });

  it("always returns every row it was given", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ n: fc.option(fc.integer(), { nil: null }) })),
        fc.constantFrom("asc", "desc"),
        (rows, dir) => {
          expect(sortRows(rows, by("n"), dir)).toHaveLength(rows.length);
        }
      )
    );
  });
});

describe("pageSlice", () => {
  const rows = Array.from({ length: 25 }, (_, i) => i + 1);

  it("returns the requested page", () => {
    expect(pageSlice(rows, 2, 10).rows).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it("returns a short final page", () => {
    const { rows: page3, totalPages } = pageSlice(rows, 3, 10);
    expect(page3).toEqual([21, 22, 23, 24, 25]);
    expect(totalPages).toBe(3);
  });

  it("clamps down to the last page when the list shrinks underneath", () => {
    // The admin was on page 3 of 25 rows, then a filter cut it to 12.
    const { rows: shown, page } = pageSlice(rows.slice(0, 12), 3, 10);
    expect(page).toBe(2);
    expect(shown).toEqual([11, 12]);
  });

  it("never reports fewer than one page, even when empty", () => {
    const { rows: shown, totalPages, page } = pageSlice([], 4, 10);
    expect(shown).toEqual([]);
    expect(totalPages).toBe(1);
    expect(page).toBe(1);
  });

  it("never returns an empty page for a non-empty list", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 60 }),
        fc.integer({ min: -5, max: 40 }),
        fc.integer({ min: 1, max: 12 }),
        (list, page, size) => {
          expect(pageSlice(list, page, size).rows.length).toBeGreaterThan(0);
        }
      )
    );
  });
});
