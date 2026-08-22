import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { formatInvoiceNumber, parseInvoiceSeq } from "./invoiceNumber.js";

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
});
