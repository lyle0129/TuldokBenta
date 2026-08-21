/**
 * Feature: open/closed sales UX rework
 * Subject: utils/freebies.js
 *
 * A service grants one free pick per unit sold. These tests pin down when the
 * checkout confirmation should fire — the case that used to pass silently is a
 * freebie row left on "-- Select --", which buildSaleItems drops on the floor.
 */
import { describe, it, expect } from "vitest";
import {
  freebieGaps,
  freebieGapsFromCart,
  freebieGapsFromSaleItems,
  describeFreebieGaps,
  clampFreebieChoices,
} from "../utils/freebies";

const line = (overrides = {}) => ({
  name: "Full Service",
  qty: 1,
  freebies: [{ classification: "Detergent", choices: [{ item: "Ariel", qty: 1 }] }],
  ...overrides,
});

describe("freebieGaps", () => {
  it("reports nothing when every slot is claimed with a real item", () => {
    expect(freebieGaps([line()])).toEqual([]);
  });

  it("reports the shortfall when slots are left unclaimed", () => {
    const gaps = freebieGaps([line({ qty: 3 })]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      serviceName: "Full Service",
      classification: "Detergent",
      unclaimed: 2,
      hasEmptyPick: false,
    });
  });

  it("reports a row that was added but never given an item", () => {
    const gaps = freebieGaps([
      line({
        freebies: [{ classification: "Plastic", choices: [{ item: "", qty: 1 }] }],
      }),
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ hasEmptyPick: true, unclaimed: 0 });
  });

  it("reports a classification with no choices at all", () => {
    const gaps = freebieGaps([
      line({ freebies: [{ classification: "Fabcon", choices: [] }] }),
    ]);
    expect(gaps[0]).toMatchObject({ classification: "Fabcon", unclaimed: 1 });
  });

  it("reports each unsatisfied classification separately", () => {
    const gaps = freebieGaps([
      line({
        qty: 1,
        freebies: [
          { classification: "Detergent", choices: [{ item: "Ariel", qty: 1 }] },
          { classification: "Plastic", choices: [] },
        ],
      }),
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].classification).toBe("Plastic");
  });

  it("ignores a service that grants no freebies", () => {
    expect(freebieGaps([line({ freebies: [] })])).toEqual([]);
  });

  it("survives a null freebies array from the server", () => {
    expect(freebieGaps([line({ freebies: null })])).toEqual([]);
    expect(freebieGaps([line({ freebies: undefined })])).toEqual([]);
  });

  it("does not report a negative shortfall when over-claimed", () => {
    const gaps = freebieGaps([
      line({ qty: 1, freebies: [{ classification: "Detergent", choices: [{ item: "Ariel", qty: 5 }] }] }),
    ]);
    expect(gaps).toEqual([]);
  });
});

describe("freebieGapsFromCart", () => {
  it("reads quantity/name off cart lines and skips inventory lines", () => {
    const cart = [
      { type: "inventory", id: 1, name: "Ariel", quantity: 2, price: 50 },
      {
        type: "service",
        id: 9,
        name: "Full Service",
        quantity: 2,
        price: 180,
        freebies: [{ classification: "Detergent", choices: [] }],
      },
    ];

    const gaps = freebieGapsFromCart(cart);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ serviceName: "Full Service", unclaimed: 2 });
  });

  it("finds nothing in a cart of plain items", () => {
    expect(
      freebieGapsFromCart([{ type: "inventory", id: 1, name: "Ariel", quantity: 1 }])
    ).toEqual([]);
  });
});

describe("freebieGapsFromSaleItems", () => {
  it("reads qty/service_name off saved sale lines", () => {
    const items = [
      { type: "item", item_name: "Ariel", qty: 1, price: 50 },
      {
        type: "service",
        service_name: "Full Service",
        qty: 2,
        price: 180,
        freebies: [{ classification: "Detergent", choices: [{ item: "Ariel", qty: 1 }] }],
      },
      // The derived price-0 line the service already emitted.
      { type: "item", item_name: "Ariel", qty: 1, price: 0, is_freebie: true, for_service: "Full Service" },
    ];

    const gaps = freebieGapsFromSaleItems(items);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ unclaimed: 1, classification: "Detergent" });
  });

  it("ignores legacy service lines saved before freebies were stored", () => {
    expect(
      freebieGapsFromSaleItems([
        { type: "service", service_name: "Wash", qty: 1, price: 100 },
      ])
    ).toEqual([]);
  });
});

describe("describeFreebieGaps", () => {
  it("names the service and what is missing", () => {
    expect(
      describeFreebieGaps([
        { serviceName: "Full Service", classification: "Detergent", unclaimed: 2, hasEmptyPick: false },
      ])
    ).toEqual(["Full Service — 2 Detergent not claimed"]);
  });

  it("mentions both problems when a classification has each", () => {
    expect(
      describeFreebieGaps([
        { serviceName: "Full Service", classification: "Plastic", unclaimed: 1, hasEmptyPick: true },
      ])
    ).toEqual([
      "Full Service — 1 Plastic not claimed, a Plastic freebie has no item chosen",
    ]);
  });
});

// ---------------------------------------------------------------------------
// clampFreebieChoices
//
// freebieGaps above only reports under-claiming. The opposite mistake — a
// service dropped from qty 3 to qty 1 after three freebies were claimed —
// leaves surplus picks behind, and every one of them is a real price-0 line the
// backend deducts stock for.
// ---------------------------------------------------------------------------
describe("clampFreebieChoices", () => {
  const detergent = (choices) => [{ classification: "Detergent", choices }];

  it("trims a single over-claimed pick down to the slots available", () => {
    expect(clampFreebieChoices(detergent([{ item: "Ariel", qty: 3 }]), 1)).toEqual(
      detergent([{ item: "Ariel", qty: 1 }])
    );
  });

  it("spends the budget in order and drops what does not fit", () => {
    const claimed = detergent([
      { item: "Ariel", qty: 2 },
      { item: "Tide", qty: 2 },
    ]);
    // 3 slots: Ariel takes its 2, Tide is cut to the 1 that remains.
    expect(clampFreebieChoices(claimed, 3)).toEqual(
      detergent([
        { item: "Ariel", qty: 2 },
        { item: "Tide", qty: 1 },
      ])
    );
  });

  it("drops trailing picks entirely once the budget is spent", () => {
    const claimed = detergent([
      { item: "Ariel", qty: 2 },
      { item: "Tide", qty: 1 },
    ]);
    expect(clampFreebieChoices(claimed, 2)).toEqual(
      detergent([{ item: "Ariel", qty: 2 }])
    );
  });

  it("never leaves a pick at zero — it removes it instead", () => {
    const clamped = clampFreebieChoices(
      detergent([
        { item: "Ariel", qty: 1 },
        { item: "Tide", qty: 1 },
      ]),
      1
    );
    expect(clamped[0].choices.every((c) => c.qty >= 1)).toBe(true);
  });

  it("clears every pick when there are no slots left", () => {
    expect(clampFreebieChoices(detergent([{ item: "Ariel", qty: 1 }]), 0)).toEqual(
      detergent([])
    );
  });

  it("clamps each classification against its own budget", () => {
    const mixed = [
      { classification: "Detergent", choices: [{ item: "Ariel", qty: 2 }] },
      { classification: "Plastic", choices: [{ item: "Small", qty: 1 }] },
    ];
    expect(clampFreebieChoices(mixed, 1)).toEqual([
      { classification: "Detergent", choices: [{ item: "Ariel", qty: 1 }] },
      { classification: "Plastic", choices: [{ item: "Small", qty: 1 }] },
    ]);
  });

  it("returns the same objects when nothing needed trimming", () => {
    // Identity matters: a fresh array on every keystroke would re-render the
    // freebie editor for no reason.
    const fits = detergent([{ item: "Ariel", qty: 1 }]);
    const clamped = clampFreebieChoices(fits, 2);
    expect(clamped[0]).toBe(fits[0]);
  });

  it("tolerates a service line whose freebies came back null", () => {
    expect(clampFreebieChoices(null, 2)).toBe(null);
    expect(clampFreebieChoices(undefined, 2)).toEqual([]);
  });
});
