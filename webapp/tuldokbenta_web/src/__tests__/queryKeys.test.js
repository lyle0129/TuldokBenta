/**
 * Feature: shop-scoped query keys
 * Subject: queryClient.js
 *
 * Properties P1–P4 from docs/specs/multipos/08-shop-picker/design.md.
 *
 * These are worth pinning as properties rather than examples because every way
 * the key shape can be wrong fails *silently*. A key missing the shop serves the
 * previous shop's rows and looks like ordinary staleness; a key with the shop at
 * index 0 stops the persister recognising the resource and looks like a blank
 * first paint. Neither throws, and neither shows up in a manual walk unless you
 * are already looking for it.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { queryKeys, PERSISTED_RESOURCES, GLOBAL_RESOURCES } from "../queryClient";

/** A plausible shop id: whole, positive, and small the way real ids are. */
const shopId = () => fc.integer({ min: 1, max: 10_000 });

const isoDate = () =>
  fc
    .date({ min: new Date("2000-01-01"), max: new Date("2100-01-01") })
    .map((d) => d.toISOString().slice(0, 10));

/**
 * Every key function, applied to a shop id and whatever else it needs.
 *
 * Written as a list rather than iterating Object.entries(queryKeys) on purpose:
 * a key added to queryClient.js without being added here shows up as a failure
 * of the "this list covers every key" test below, rather than quietly not being
 * checked by any of these properties.
 */
const applyAll = (shop, day, from, to) => [
  ["inventory", queryKeys.inventory(shop)],
  ["services", queryKeys.services(shop)],
  ["paymentMethods", queryKeys.paymentMethods(shop)],
  // Shop-scoped, not global: the receipt header is the thing ticket 09 moved
  // into the database precisely so that two shops print different ones.
  ["shopProfile", queryKeys.shopProfile(shop)],
  ["openSales", queryKeys.openSales(shop)],
  ["nextInvoice", queryKeys.nextInvoice(shop)],
  ["closedSales", queryKeys.closedSales(shop)],
  ["closedSalesDay", queryKeys.closedSalesDay(shop, day)],
  ["closedSalesWindow", queryKeys.closedSalesWindow(shop, from, to)],
];

/**
 * The keys that deliberately carry NO shop, added by ticket 10.
 *
 * The console acts across shops — api.js sends no X-Shop-Id for /admin/*, and
 * the backend's admin router mounts no resolveShop — so a shop dimension on
 * these would describe a scoping that does not exist. They are listed
 * separately rather than exempted inside applyAll so that P1 and P2 keep
 * meaning "every shop-scoped key", and so a new key must be filed as one or the
 * other before the coverage test below will pass.
 */
const applyGlobal = () => [
  ["adminShops", queryKeys.adminShops()],
  ["adminUsers", queryKeys.adminUsers()],
  ["auditLog", queryKeys.auditLog({ from: "2026-01-01", to: "2026-01-02" })],
];

describe("P1 — every key carries the shop", () => {
  it("includes the shop id in every key it produces", () => {
    fc.assert(
      fc.property(shopId(), isoDate(), isoDate(), isoDate(), (shop, day, from, to) => {
        for (const [name, key] of applyAll(shop, day, from, to)) {
          expect(key, name).toContain(shop);
        }
      })
    );
  });

  it("covers every key queryKeys exports", () => {
    // Guards the two hand-written lists above. Without this, adding a key to
    // queryClient.js and forgetting it here would leave it unchecked by P1–P4 —
    // and an unscoped key is exactly what these properties exist to catch. A new
    // key has to be filed as shop-scoped or global before this passes, which is
    // the moment to decide which it is.
    const checked = [
      ...applyAll(1, "2026-01-01", "2026-01-01", "2026-01-31"),
      ...applyGlobal(),
    ].map(([name]) => name);
    expect(checked.sort()).toEqual(Object.keys(queryKeys).sort());
  });
});

describe("P2 — the resource name stays at index 0", () => {
  it("puts a resource-name string first and the shop second", () => {
    fc.assert(
      fc.property(shopId(), isoDate(), isoDate(), isoDate(), (shop, day, from, to) => {
        for (const [name, key] of applyAll(shop, day, from, to)) {
          expect(typeof key[0], name).toBe("string");
          expect(key[1], name).toBe(shop);
        }
      })
    );
  });

  it("names every persisted resource at index 0 of some key", () => {
    // persistOptions.dehydrateOptions filters on
    // PERSISTED_RESOURCES.includes(queryKey[0]). If a resource name moved off
    // index 0, or was renamed on one side only, that filter would match nothing
    // and the app would simply stop restoring anything from disk.
    const heads = new Set(
      applyAll(1, "2026-01-01", "2026-01-01", "2026-01-31").map(([, key]) => key[0])
    );
    for (const resource of PERSISTED_RESOURCES) {
      expect(heads, resource).toContain(resource);
    }
  });
});

describe("P3 — closed-sales keys share a prefix", () => {
  it("starts all three with the same two elements", () => {
    // One invalidation of ["closedSales", shopId] has to cover the full table,
    // every cached day and every cached report window — for this shop and no
    // other. That is what the sale mutations rely on.
    fc.assert(
      fc.property(shopId(), isoDate(), isoDate(), isoDate(), (shop, day, from, to) => {
        const expected = ["closedSales", shop];
        expect(queryKeys.closedSales(shop).slice(0, 2)).toEqual(expected);
        expect(queryKeys.closedSalesDay(shop, day).slice(0, 2)).toEqual(expected);
        expect(
          queryKeys.closedSalesWindow(shop, from, to).slice(0, 2)
        ).toEqual(expected);
      })
    );
  });

  it("keeps the day and window views distinct from each other", () => {
    // Sharing a prefix must not tip over into colliding: the day slice and the
    // report window ask the server different questions over the same table.
    fc.assert(
      fc.property(shopId(), isoDate(), isoDate(), (shop, from, to) => {
        expect(queryKeys.closedSalesDay(shop, from)).not.toEqual(
          queryKeys.closedSalesWindow(shop, from, to)
        );
      })
    );
  });
});

describe("ticket 10 P3 — admin data is never persisted", () => {
  it("keeps every global resource out of PERSISTED_RESOURCES", () => {
    // Required for the audit log by Requirement 4.8: writing a page of an
    // unbounded, append-only log to localStorage for 24 hours is exactly the
    // cost the endpoint's mandatory range and capped page size exist to avoid.
    // It is simply correct for the other two, which must never be stale when
    // someone is granting or revoking access.
    for (const resource of GLOBAL_RESOURCES) {
      expect(PERSISTED_RESOURCES, resource).not.toContain(resource);
    }
  });

  it("names every global resource at index 0 of its key", () => {
    // The persister filters on queryKey[0]. This is what makes the assertion
    // above load-bearing rather than a statement about two unrelated lists.
    const heads = applyGlobal().map(([, key]) => key[0]);
    expect(heads.sort()).toEqual([...GLOBAL_RESOURCES].sort());
  });
});

describe("P4 — different shops never collide", () => {
  it("produces a different key for every distinct shop id", () => {
    fc.assert(
      fc.property(
        shopId(),
        shopId(),
        isoDate(),
        isoDate(),
        isoDate(),
        (a, b, day, from, to) => {
          fc.pre(a !== b);

          const left = applyAll(a, day, from, to);
          const right = applyAll(b, day, from, to);

          left.forEach(([name, key], i) => {
            expect(key, name).not.toEqual(right[i][1]);
          });
        }
      )
    );
  });
});
