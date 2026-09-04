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

      // A line is one of two shapes and the component branches on exactly this
      // discriminant: a changed sale's lines, or a before/after pair of strings.
      if (line.kind === "items") {
        expect(Array.isArray(line.items)).toBe(true);
        expect(line.items.length).toBeGreaterThan(0);
        for (const item of line.items) {
          expect(typeof item.name).toBe("string");
          expect(["added", "removed", "qty"]).toContain(item.change);
          expect(Number.isFinite(item.qtyBefore)).toBe(true);
          expect(Number.isFinite(item.qtyAfter)).toBe(true);
        }
        continue;
      }

      expect(typeof line.after).toBe("string");
      // `before` is null for a one-sided payload, a string otherwise.
      expect(line.before === null || typeof line.before === "string").toBe(true);
    }
  }
};

/** A sale line as the cart writes it. */
const line = (name, qty, price, type = "item") => ({
  qty,
  type,
  price,
  [type === "service" ? "service_name" : "item_name"]: name,
});

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
      // Money carries the sign the rest of the app prints; a stock count does not.
      { field: "Price", before: "₱170.00", after: "₱185.00" },
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

  it("reads a sale's changed lines as the lines that changed", () => {
    // The payload from the screenshot that prompted this: `diff` stores both
    // whole arrays, and one bottle of Surf is the entire change.
    const before = [
      line("Full Service", 1, "170.00", "service"),
      line("[Detergent] Champion", 1, 0),
      line("Plastic", 1, 0),
    ];
    const after = [
      line("Full Service", 1, "170.00", "service"),
      line("[Detergent] Champion", 1, 0),
      line("Plastic", 2, 0),
      line("[Detergent] Surf", 1, "15.00"),
    ];

    const summary = summarizeChanges({
      before: { items: before },
      after: { items: after },
    });

    expect(summary.kind).toBe("lines");
    const items = summary.lines[0];
    expect(items.field).toBe("Items");
    expect(items.kind).toBe("items");
    // Only the two lines that moved — the unchanged service and detergent are
    // absent, which is the whole point.
    expect(items.items).toEqual([
      expect.objectContaining({ change: "qty", name: "Plastic", qtyBefore: 1, qtyAfter: 2 }),
      expect.objectContaining({ change: "added", name: "[Detergent] Surf", qtyAfter: 1 }),
    ]);
  });

  it("reports a removed line rather than dropping it", () => {
    const summary = summarizeChanges({
      before: { items: [line("Plastic", 1, 0), line("Fabcon", 1, 0)] },
      after: { items: [line("Plastic", 1, 0)] },
    });

    expect(summary.lines[0].items).toEqual([
      expect.objectContaining({ change: "removed", name: "Fabcon", qtyBefore: 1 }),
    ]);
  });

  it("falls back rather than claiming nothing changed on a pure reorder", () => {
    // The arrays differ, so the write did something; the differ cannot name it.
    // Reporting "no change" here would be the summariser lying about the record.
    const summary = summarizeChanges({
      before: { items: [line("Plastic", 1, 0), line("Fabcon", 1, 0)] },
      after: { items: [line("Fabcon", 1, 0), line("Plastic", 1, 0)] },
    });

    expect(summary.kind).toBe("lines");
    expect(summary.lines[0].kind).toBeUndefined();
    expect(typeof summary.lines[0].after).toBe("string");
  });

  it("reads a restock's before/after/amount as a diff, not three fragments", () => {
    // inventoryController writes an `amount` alongside the pair. It used to
    // miss the pair branch entirely and render as one-sided JSON.
    const summary = summarizeChanges({
      before: { stock: 5 },
      after: { stock: 12 },
      amount: 7,
    });

    expect(summary.lines).toEqual([
      { field: "Stock", before: "5", after: "12" },
      { field: "Amount added", before: null, after: "7" },
    ]);
  });

  it("prints money fields as pesos", () => {
    const summary = summarizeChanges({
      before: { price: "170.00" },
      after: { price: "185.00" },
    });

    expect(summary.lines).toEqual([
      { field: "Price", before: "₱170.00", after: "₱185.00" },
    ]);
  });

  it("prints a list of plain values as a list", () => {
    const summary = summarizeChanges({
      before: { freebies: ["Plastic", "Detergent"] },
      after: { freebies: ["Plastic", "Detergent", "Fabcon"] },
    });

    expect(summary.lines).toEqual([
      { field: "Freebies", before: "Plastic, Detergent", after: "Plastic, Detergent, Fabcon" },
    ]);
  });

  it("names a user's shops when it is told what they are called", () => {
    const changes = { before: { shop_ids: [1] }, after: { shop_ids: [1, 2] } };

    expect(summarizeChanges(changes, { shopsById: { 1: { name: "Playground" }, 2: { name: "Downtown" } } }).lines).toEqual([
      { field: "Shops", before: "Playground", after: "Playground, Downtown" },
    ]);

    // With no lookup — or a shop the viewer cannot see — the id still names
    // itself. A gap here would be worse than an ugly label.
    expect(summarizeChanges(changes).lines).toEqual([
      { field: "Shops", before: "Shop 1", after: "Shop 1, Shop 2" },
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
