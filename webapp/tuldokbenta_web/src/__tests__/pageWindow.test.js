/**
 * Feature: open/closed sales UX rework
 * Subject: utils/pageWindow.js
 *
 * The pagers used to render one button per page. Now that the closed-sales day
 * picker makes long lists reachable, the strip has to stay a bounded width on
 * a phone no matter how many pages there are.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { pageWindow } from "../utils/pageWindow";

describe("pageWindow", () => {
  it("lists every page when there are few enough to fit", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("collapses the middle when near the start", () => {
    expect(pageWindow(2, 20)).toEqual([1, 2, 3, "…", 20]);
  });

  it("collapses both sides when in the middle", () => {
    expect(pageWindow(10, 20)).toEqual([1, "…", 9, 10, 11, "…", 20]);
  });

  it("collapses the middle when near the end", () => {
    expect(pageWindow(19, 20)).toEqual([1, "…", 18, 19, 20]);
  });

  it("always includes the first and last page", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 500 }),
        (current, total) => {
          const page = Math.min(current, total);
          const window = pageWindow(page, total);
          expect(window).toContain(1);
          expect(window).toContain(total);
        }
      )
    );
  });

  it("always includes the current page", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 500 }),
        (current, total) => {
          const page = Math.min(current, total);
          expect(pageWindow(page, total)).toContain(page);
        }
      )
    );
  });

  it("stays a bounded width however many pages exist", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000 }), (total) => {
        // first + gap + 3 neighbours + gap + last
        expect(pageWindow(Math.ceil(total / 2), total).length).toBeLessThanOrEqual(7);
      })
    );
  });

  it("never repeats a page number", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 1, max: 200 }),
        (current, total) => {
          const numbers = pageWindow(Math.min(current, total), total).filter(
            (p) => typeof p === "number"
          );
          expect(new Set(numbers).size).toBe(numbers.length);
        }
      )
    );
  });

  it("keeps page numbers in ascending order", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 1, max: 200 }),
        (current, total) => {
          const numbers = pageWindow(Math.min(current, total), total).filter(
            (p) => typeof p === "number"
          );
          expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
        }
      )
    );
  });

  it("only inserts an ellipsis where pages were actually skipped", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 1, max: 200 }),
        (current, total) => {
          const window = pageWindow(Math.min(current, total), total);
          window.forEach((entry, i) => {
            if (entry !== "…") return;
            expect(window[i + 1] - window[i - 1]).toBeGreaterThan(1);
          });
        }
      )
    );
  });
});
