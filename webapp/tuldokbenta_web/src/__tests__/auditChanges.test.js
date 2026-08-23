/**
 * Feature: rendering an audit event's `changes`
 * Subject: utils/auditChanges.js
 *
 * Property P4 from docs/specs/multipos/10-superadmin-console/design.md.
 *
 * `changes` is a JSONB column written by eight controllers over the life of the
 * program, in at least three shapes, with no schema and deliberately so. The
 * summariser therefore cannot be tested for coverage — the next shape has not
 * been written yet. What it can be tested for is degradation: any payload at
 * all produces something renderable, because the alternative is a thrown error
 * inside a list and a blank screen where the evidence should be.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { summarizeChanges } from "../utils/auditChanges";

const KINDS = ["none", "text", "lines", "json"];

const isRenderable = (summary) => {
  expect(KINDS).toContain(summary.kind);
  if (summary.kind === "text" || summary.kind === "json") {
    expect(typeof summary.text).toBe("string");
  }
  if (summary.kind === "lines") {
    expect(Array.isArray(summary.lines)).toBe(true);
    for (const line of summary.lines) {
      expect(typeof line.field).toBe("string");
      expect(typeof line.after).toBe("string");
      // `before` is null for a one-sided payload, a string otherwise — the
      // component branches on exactly that.
      expect(line.before === null || typeof line.before === "string").toBe(true);
    }
  }
};

describe("P4 — the change summariser never throws", () => {
  it("survives arbitrary payloads", () => {
    fc.assert(
      fc.property(fc.anything(), (changes) => {
        isRenderable(summarizeChanges(changes));
      }),
      { numRuns: 500 }
    );
  });

  it("survives the shapes that have actually been seen", () => {
    // A `{before, after}` pair with arbitrary contents is the shape `diff`
    // produces, and it is the one most likely to hold something unexpected —
    // `items` is an array of objects, and a nested value can be anything.
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), fc.anything()),
        fc.dictionary(fc.string(), fc.anything()),
        (before, after) => {
          isRenderable(summarizeChanges({ before, after }));
        }
      )
    );
  });

  it("survives the empty and absent cases", () => {
    for (const payload of [null, undefined, {}, [], "", 0, false]) {
      isRenderable(summarizeChanges(payload));
    }
  });

  it("survives a deeply nested payload", () => {
    let nested = { leaf: true };
    for (let i = 0; i < 200; i += 1) nested = { level: nested };
    isRenderable(summarizeChanges({ before: {}, after: nested }));
  });

  it("survives a payload JSON.stringify itself refuses", () => {
    const cyclic = { name: "loop" };
    cyclic.self = cyclic;
    isRenderable(summarizeChanges({ before: {}, after: { cyclic } }));
  });
});

describe("the shapes it does recognise", () => {
  it("reads a before/after pair as one line per changed field", () => {
    const summary = summarizeChanges({
      before: { stock: 12, price: "170.00" },
      after: { stock: 20, price: "185.00" },
    });

    expect(summary.kind).toBe("lines");
    expect(summary.lines).toEqual([
      { field: "Stock", before: "12", after: "20" },
      { field: "Price", before: "170.00", after: "185.00" },
    ]);
  });

  it("reads a sale summary as one compact line", () => {
    const summary = summarizeChanges({
      invoice_number: "INV-0042",
      line_count: 3,
      total: 410,
    });

    expect(summary).toEqual({ kind: "text", text: "3 lines · ₱410.00" });
  });

  it("says nothing for a diff that found no change", () => {
    // utils/audit.js narrows to the keys that actually differ, so an empty pair
    // means the write touched nothing worth recording.
    expect(summarizeChanges({ before: {}, after: {} })).toEqual({ kind: "none" });
  });

  it("reads a delete's before-only payload as a change into nothing", () => {
    // user.delete records what the account was and no `after`, so each field
    // reads "ada → —" rather than being dropped for having no right-hand side.
    const summary = summarizeChanges({
      before: { username: "ada", role: "worker" },
    });

    expect(summary.kind).toBe("lines");
    expect(summary.lines).toEqual([
      { field: "Username", before: "ada", after: "—" },
      { field: "Role", before: "worker", after: "—" },
    ]);
  });

  it("falls back to JSON rather than to nothing", () => {
    // A primitive is not a shape the summariser knows, and an unfamiliar action
    // still has to show something.
    expect(summarizeChanges("a bare string")).toEqual({
      kind: "json",
      text: '"a bare string"',
    });
  });
});
