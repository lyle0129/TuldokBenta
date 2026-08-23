import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import { formatInvoiceNumber, parseInvoiceSeq } from "./invoiceNumber.js";

/**
 * Prefixes a shop can actually be given, for the properties below.
 *
 * Two constraints, both of which the schema default 'INV-' satisfies:
 *
 * - Ends in a non-digit. Without this P2 is simply false: formatInvoiceNumber(1, "A")
 *   is "A0001", and parsing that with prefix "A0" yields 1, because padStart supplied
 *   the zero the second prefix then eats. A prefix ending in a non-digit leaves a
 *   remainder that cannot be all digits under any other prefix, so it disappears.
 * - Survives trim(). parseInvoiceSeq trims its input first — the number is typed by
 *   hand on the offline page — so a prefix with edge whitespace could never match the
 *   string it had just produced.
 */
const prefixArb = fc
  .string({ minLength: 1, maxLength: 10 })
  .filter((s) => s.trim() === s && !/\d$/.test(s));

describe("formatInvoiceNumber", () => {
  test("pads to four digits", () => {
    assert.equal(formatInvoiceNumber(1), "INV-0001");
    assert.equal(formatInvoiceNumber(87), "INV-0087");
    assert.equal(formatInvoiceNumber(9999), "INV-9999");
  });

  test("keeps growing past the pad width rather than wrapping", () => {
    // The 10,000th sale must not collide with the 1st.
    assert.equal(formatInvoiceNumber(10000), "INV-10000");
  });
});

describe("parseInvoiceSeq", () => {
  test("round-trips with formatInvoiceNumber", () => {
    for (const seq of [1, 42, 9999, 12345]) {
      assert.equal(parseInvoiceSeq(formatInvoiceNumber(seq)), seq);
    }
  });

  test("tolerates surrounding whitespace, since the number is typed by hand", () => {
    assert.equal(parseInvoiceSeq("  INV-0042  "), 42);
  });

  test("returns null — never NaN — for anything that is not INV-<digits>", () => {
    // NaN is the failure that mattered: it used to flow into Math.max and turn the
    // whole next-invoice calculation into NaN.
    for (const junk of ["", "INV-", "INV-12a", "0087", "inv-0087", "INV-00-87"]) {
      assert.equal(parseInvoiceSeq(junk), null, junk);
    }
  });

  test("returns null for non-strings", () => {
    for (const junk of [undefined, null, 87, {}, []]) {
      assert.equal(parseInvoiceSeq(junk), null, `${junk}`);
    }
  });

  test("is prefix-sensitive: a number formatted under one prefix does not parse under another", () => {
    // A shop that edits its prefix must not be able to read another shop's series.
    assert.equal(parseInvoiceSeq("INV-0087", "SPN-"), null);
    assert.equal(parseInvoiceSeq("SPN-0087", "INV-"), null);
  });
});

// ─────────────────────────── Properties ───────────────────────────
//
// The pure half of per-shop invoice allocation. Everything else in this ticket is
// I/O against the database and is covered by the two-shop integration matrix.

describe("invoice number properties", () => {
  test("P1: format and parse round-trip under any prefix", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000_000 }), prefixArb, (n, prefix) => {
        assert.equal(parseInvoiceSeq(formatInvoiceNumber(n, prefix), prefix), n);
      })
    );
  });

  test("P2: parsing is prefix-sensitive", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        prefixArb,
        prefixArb,
        (n, a, b) => {
          fc.pre(a !== b);
          assert.equal(parseInvoiceSeq(formatInvoiceNumber(n, a), b), null);
        }
      )
    );
  });

  test("P3: unparseable input is never NaN", () => {
    // Restates a guarantee the old signature already held — invoiceNumber.js
    // documents the parseInt bug that made it necessary — because the signature
    // changed and the guarantee has to survive the change.
    fc.assert(
      fc.property(fc.string(), prefixArb, (junk, prefix) => {
        const result = parseInvoiceSeq(junk, prefix);
        assert.ok(
          result === null || (Number.isInteger(result) && result >= 0),
          `got ${result} for ${JSON.stringify(junk)}`
        );
      })
    );
  });
});
