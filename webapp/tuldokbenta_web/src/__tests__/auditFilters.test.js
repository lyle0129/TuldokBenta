/**
 * Feature: the audit viewer's query layer
 * Subject: utils/auditFilters.js
 *
 * Properties P1 and P2 from docs/specs/multipos/10-superadmin-console/design.md.
 *
 * Both properties protect a backend decision from a frontend convenience. The
 * audit endpoint is the only reader of a table designed to grow forever, and it
 * is deliberately awkward — a range is mandatory, the page is capped at 100 —
 * because a convenient unbounded read of that table is a production incident
 * with a long fuse. A client that quietly defaults the range or asks for more
 * rows than the cap undoes that from the outside, and neither mistake fails
 * loudly: the first works fine until the table is large, and the second is
 * silently clamped by the server into a paging bug nobody can see.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  buildAuditParams,
  hasRange,
  MAX_AUDIT_LIMIT,
} from "../utils/auditFilters";

const isoDate = () =>
  fc
    .date({ min: new Date("2000-01-01"), max: new Date("2100-01-01"), noInvalidDate: true })
    .map((d) => d.toISOString().slice(0, 10));

/** The values a select or a date input can actually hold when nothing is chosen. */
const blank = () => fc.constantFrom(undefined, null, "", "   ");

describe("P1 — the audit query never fires without a range", () => {
  it("rejects any filter object missing either bound", () => {
    fc.assert(
      fc.property(isoDate(), blank(), (date, missing) => {
        expect(hasRange({ from: date, to: missing })).toBe(false);
        expect(hasRange({ from: missing, to: date })).toBe(false);
        expect(hasRange({ from: missing, to: missing })).toBe(false);
      })
    );
  });

  it("accepts only a filter object carrying both", () => {
    fc.assert(
      fc.property(isoDate(), isoDate(), (from, to) => {
        expect(hasRange({ from, to })).toBe(true);
      })
    );
  });

  it("says no to nothing at all", () => {
    // The state the page holds for the half-second before its defaults land,
    // and the state an "all time" option would produce if anyone added one.
    expect(hasRange(undefined)).toBe(false);
    expect(hasRange(null)).toBe(false);
    expect(hasRange({})).toBe(false);
  });
});

describe("P2 — the requested limit is never above 100", () => {
  it("clamps any requested limit to the cap", () => {
    fc.assert(
      fc.property(
        isoDate(),
        isoDate(),
        fc.oneof(fc.integer(), fc.double(), fc.constantFrom(undefined, null, "", "abc")),
        (from, to, limit) => {
          const params = new URLSearchParams(buildAuditParams({ from, to, limit }));
          const sent = Number(params.get("limit"));

          expect(Number.isInteger(sent)).toBe(true);
          expect(sent).toBeGreaterThan(0);
          expect(sent).toBeLessThanOrEqual(MAX_AUDIT_LIMIT);
        }
      )
    );
  });

  it("passes a sensible limit through untouched", () => {
    const params = new URLSearchParams(
      buildAuditParams({ from: "2026-08-01", to: "2026-08-01", limit: 25 })
    );
    expect(params.get("limit")).toBe("25");
  });
});

describe("the range it actually sends", () => {
  it("makes the upper bound the start of the day after `to`", () => {
    // The endpoint compares `occurred_at >= from AND occurred_at < to`. An
    // inclusive-looking upper bound against an exclusive comparison is how the
    // last events of the range go quietly missing.
    const params = new URLSearchParams(
      buildAuditParams({ from: "2026-08-01", to: "2026-08-01" })
    );

    const from = params.get("from");
    const to = params.get("to");

    expect(Date.parse(`${to}Z`) - Date.parse(`${from}Z`)).toBe(24 * 60 * 60 * 1000);
  });

  it("omits every filter that is blank", () => {
    const params = new URLSearchParams(
      buildAuditParams({
        from: "2026-08-01",
        to: "2026-08-02",
        shopId: "",
        actorId: "   ",
        action: null,
        cursor: undefined,
      })
    );

    expect(params.has("shop_id")).toBe(false);
    expect(params.has("actor_id")).toBe(false);
    expect(params.has("action")).toBe(false);
    expect(params.has("cursor")).toBe(false);
  });

  it("passes the cursor through exactly as it was given", () => {
    // Opaque to the client: getAuditLog answers a cursor it cannot parse with a
    // 400 rather than restarting the walk, so anything normalised here would
    // duplicate or skip rows.
    const cursor = "2026-08-01 13:45:02.117|4821";
    const params = new URLSearchParams(
      buildAuditParams({ from: "2026-08-01", to: "2026-08-02", cursor })
    );
    expect(params.get("cursor")).toBe(cursor);
  });
});
