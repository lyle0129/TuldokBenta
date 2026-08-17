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
