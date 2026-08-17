import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  buildSaleItems,
  syncFreebieLines,
  isFreebieLine,
} from "../utils/buildSaleItems";

const fullService = {
  type: "service",
  id: 1,
  name: "Full Service",
  price: 170,
  quantity: 2,
  freebies: [
    { classification: "Detergent", choices: [{ item: "[Detergent] Ariel", qty: 2 }] },
    { classification: "Plastic", choices: [] },
  ],
};

describe("buildSaleItems", () => {
  it("maps an inventory cart line straight through", () => {
    const items = buildSaleItems([
      { type: "inventory", id: 1, name: "Bleach", price: 10, quantity: 3 },
    ]);
    expect(items).toEqual([
      { type: "item", item_name: "Bleach", qty: 3, price: 10 },
    ]);
  });

  it("keeps the freebies array on the service line so the sale stays editable", () => {
    const [service] = buildSaleItems([fullService]);
    expect(service.type).toBe("service");
    // Previously dropped here, which is why the freebie editor never rendered
    // for a sale loaded back from the server.
    expect(service.freebies).toEqual(fullService.freebies);
  });

  it("also emits price-0 inventory lines so freebie stock is deducted", () => {
    const items = buildSaleItems([fullService]);
    const freebies = items.filter(isFreebieLine);

    expect(freebies).toEqual([
      {
        type: "item",
        item_name: "[Detergent] Ariel",
        qty: 2,
        price: 0,
        is_freebie: true,
        for_service: "Full Service",
      },
    ]);
  });

  it("ignores freebie slots with no item picked", () => {
    const items = buildSaleItems([fullService]);
    expect(items.filter(isFreebieLine)).toHaveLength(1); // the empty Plastic slot is skipped
  });

  it("skips cart entries of an unknown type", () => {
    expect(buildSaleItems([{ type: "mystery", name: "?" }])).toEqual([]);
  });
});

describe("syncFreebieLines", () => {
  it("regenerates freebie lines from the current service state", () => {
    const items = buildSaleItems([fullService]);

    // Simulate the edit modal changing which freebie was chosen.
    items[0].freebies[0].choices[0] = { item: "[Detergent] Tide", qty: 1 };

    const synced = syncFreebieLines(items);
    const freebies = synced.filter(isFreebieLine);

    expect(freebies).toHaveLength(1);
    expect(freebies[0].item_name).toBe("[Detergent] Tide");
    expect(freebies[0].qty).toBe(1);
  });

  it("drops freebie lines when their service loses all its choices", () => {
    const items = buildSaleItems([fullService]);
    items[0].freebies = items[0].freebies.map((f) => ({ ...f, choices: [] }));

    expect(syncFreebieLines(items).filter(isFreebieLine)).toEqual([]);
  });

  it("leaves hand-added lines alone", () => {
    const manual = { type: "item", item_name: "Bleach", qty: 1, price: 10 };
    const synced = syncFreebieLines([...buildSaleItems([fullService]), manual]);
    expect(synced).toContainEqual(manual);
  });

  it("preserves legacy sales whose services carry no freebies array", () => {
    // Rows saved before freebies were stored on the service line. They have no
    // `freebies` and no markers, so nothing about them should change.
    const legacy = [
      { type: "service", service_name: "Wash", qty: 1, price: 60 },
      { type: "item", item_name: "[Detergent] Ariel", qty: 1, price: 0 },
    ];
    expect(syncFreebieLines(legacy)).toEqual(legacy);
  });

  it("is idempotent — syncing twice matches syncing once", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constant("service"),
            id: fc.integer({ min: 1, max: 5 }),
            name: fc.constantFrom("Full Service", "Wash", "Dry"),
            price: fc.integer({ min: 1, max: 500 }),
            quantity: fc.integer({ min: 1, max: 5 }),
            freebies: fc.array(
              fc.record({
                classification: fc.constantFrom("Detergent", "Fabcon", "Plastic"),
                choices: fc.array(
                  fc.record({
                    item: fc.constantFrom("Ariel", "Tide", ""),
                    qty: fc.integer({ min: 1, max: 3 }),
                  }),
                  { maxLength: 3 }
                ),
              }),
              { maxLength: 3 }
            ),
          }),
          { maxLength: 4 }
        ),
        (cart) => {
          const once = syncFreebieLines(buildSaleItems(cart));
          expect(syncFreebieLines(once)).toEqual(once);
        }
      )
    );
  });
});