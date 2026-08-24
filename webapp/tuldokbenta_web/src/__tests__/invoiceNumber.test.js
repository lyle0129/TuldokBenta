/**
 * Feature: invoice number parsing
 * Subject: utils/invoiceNumber.js
 *
 * Mirrors backend/utils/invoiceNumber.test.js. The two implementations have to agree,
 * because the offline page allocates a placeholder with this one and the server
 * decides the real number with the other.
 */
import { describe, it, expect } from "vitest";
import {
  formatInvoiceNumber,
  parseInvoiceSeq,
  maxInvoiceSeq,
} from "../utils/invoiceNumber";

describe("formatInvoiceNumber", () => {
  it("pads to four digits", () => {
    expect(formatInvoiceNumber(1)).toBe("INV-0001");
    expect(formatInvoiceNumber(87)).toBe("INV-0087");
    expect(formatInvoiceNumber(9999)).toBe("INV-9999");
  });

  it("keeps growing past the pad width rather than wrapping", () => {
    expect(formatInvoiceNumber(10000)).toBe("INV-10000");
  });

  it("uses the shop's own prefix when given one", () => {
    expect(formatInvoiceNumber(1, "SPN-")).toBe("SPN-0001");
    expect(formatInvoiceNumber(87, "")).toBe("0087");
  });
});

describe("parseInvoiceSeq", () => {
  it("round-trips with formatInvoiceNumber", () => {
    for (const seq of [1, 42, 9999, 12345]) {
      expect(parseInvoiceSeq(formatInvoiceNumber(seq))).toBe(seq);
    }
  });

  it("tolerates surrounding whitespace, since the number is typed by hand", () => {
    expect(parseInvoiceSeq("  INV-0042  ")).toBe(42);
  });

  it("returns null — never NaN — for anything that is not INV-<digits>", () => {
    // NaN is the failure that mattered: the old parseInt(...) let it into
    // Math.max, which made the whole next-invoice calculation NaN.
    for (const junk of ["", "INV-", "INV-12a", "0087", "inv-0087"]) {
      expect(parseInvoiceSeq(junk), junk).toBeNull();
    }
  });

  it("returns null for non-strings", () => {
    for (const junk of [undefined, null, 87, {}, []]) {
      expect(parseInvoiceSeq(junk)).toBeNull();
    }
  });

  it("round-trips under a shop's own prefix, and refuses another shop's", () => {
    expect(parseInvoiceSeq("SPN-0042", "SPN-")).toBe(42);
    // The reason two shops can both hold 0042 without either page confusing them.
    expect(parseInvoiceSeq("INV-0042", "SPN-")).toBeNull();
  });

  it("does not treat the prefix as a pattern", () => {
    // "INV." as a RegExp would match "INVx0042" and count a foreign number as
    // this shop's. The prefix is a shop-editable column, so it has to be matched
    // literally — the same reason the backend uses startsWith.
    expect(parseInvoiceSeq("INVx0042", "INV.")).toBeNull();
    expect(parseInvoiceSeq("INV.0042", "INV.")).toBe(42);
  });
});

describe("maxInvoiceSeq", () => {
  it("finds the highest sequence", () => {
    expect(maxInvoiceSeq(["INV-0003", "INV-0087", "INV-0012"])).toBe(87);
  });

  it("is 0 for an empty list", () => {
    expect(maxInvoiceSeq([])).toBe(0);
  });

  it("skips unparseable numbers instead of poisoning the result", () => {
    expect(maxInvoiceSeq(["INV-0003", "scratch pad", undefined, "INV-0009"])).toBe(9);
    expect(maxInvoiceSeq(["nothing parseable"])).toBe(0);
  });

  it("counts only numbers in the prefix it was given", () => {
    expect(maxInvoiceSeq(["SPN-0003", "INV-9999", "SPN-0009"], "SPN-")).toBe(9);
  });
});
