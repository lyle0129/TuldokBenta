/**
 * Subject: utils/buildSaleItems.js
 *
 * A sale is stored flat: a bare service line, plus one ordinary price-0 item
 * line per freebie. The `freebies` array that drives the picker and the
 * unclaimed-freebie warning is built when a sale is opened and taken back off
 * when it is saved — it never reaches the database. These tests pin both
 * directions, and pin that a round trip changes nothing.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  buildSaleItems,
  flattenSaleItems,
  hydrateSaleItems,
  displayLines,
  isFreebieLine,
  isFreeLine,
} from "../utils/buildSaleItems";

/** The catalog hydration reads: what a service grants, and what an item is. */
const CATALOG = {
  services: [
    { service_name: "Full Service", freebies: ["Plastic", "Detergent", "Fabcon"] },
    { service_name: "Wash", freebies: [] },
  ],
  inventory: [
    { item_name: "Plastic", item_classification: "Plastic" },
    { item_name: "[Detergent] Champion", item_classification: "Detergent" },
    { item_name: "[Detergent] Ariel", item_classification: "Detergent" },
    { item_name: "[Fabcon] Champion", item_classification: "Fabcon" },
    { item_name: "Bleach", item_classification: "Cleaner" },
  ],
};

/** A Full Service exactly as it is stored. */
const storedFullService = () => [
  { qty: 1, type: "service", price: "170.00", service_name: "Full Service" },
  { qty: 1, type: "item", price: 0, item_name: "Plastic" },
  { qty: 1, type: "item", price: 0, item_name: "[Detergent] Champion" },
  { qty: 1, type: "item", price: 0, item_name: "[Fabcon] Champion" },
];

/** The same service as a cart line, with its picks made. */
const cartFullService = (overrides = {}) => ({
  type: "service",
  id: 1,
  name: "Full Service",
  price: 170,
  quantity: 1,
  freebies: [
    { classification: "Plastic", choices: [{ item: "Plastic", qty: 1 }] },
    {
      classification: "Detergent",
      choices: [{ item: "[Detergent] Champion", qty: 1 }],
    },
    {
      classification: "Fabcon",
      choices: [{ item: "[Fabcon] Champion", qty: 1 }],
    },
  ],
  ...overrides,
});

// ---------------------------------------------------------------------------
// buildSaleItems — cart to stored
// ---------------------------------------------------------------------------
describe("buildSaleItems", () => {
  it("maps an inventory cart line straight through", () => {
    expect(
      buildSaleItems([
        { type: "inventory", id: 1, name: "Bleach", price: 10, quantity: 3 },
      ])
    ).toEqual([{ type: "item", item_name: "Bleach", qty: 3, price: 10 }]);
  });

  it("writes a checked-out Full Service in the stored shape", () => {
    expect(buildSaleItems([cartFullService()])).toEqual([
      { type: "service", service_name: "Full Service", qty: 1, price: 170 },
      { type: "item", item_name: "Plastic", qty: 1, price: 0 },
      { type: "item", item_name: "[Detergent] Champion", qty: 1, price: 0 },
      { type: "item", item_name: "[Fabcon] Champion", qty: 1, price: 0 },
    ]);
  });

  it("leaves no freebie state on the service line", () => {
    const [service] = buildSaleItems([cartFullService()]);
    // The granted classifications live in the service catalog. A copy frozen
    // onto the sale goes stale the moment a service's freebies are edited.
    expect(service).not.toHaveProperty("freebies");
  });

  it("tags nothing — a freebie is an ordinary price-0 line", () => {
    const items = buildSaleItems([cartFullService()]);
    expect(items.some(isFreebieLine)).toBe(false);
    expect(items.filter(isFreeLine)).toHaveLength(3);
  });

  it("ignores freebie slots with no item picked", () => {
    const items = buildSaleItems([
      cartFullService({
        freebies: [
          { classification: "Plastic", choices: [{ item: "Plastic", qty: 1 }] },
          { classification: "Fabcon", choices: [{ item: "", qty: 1 }] },
        ],
      }),
    ]);
    expect(items.filter(isFreeLine)).toHaveLength(1);
  });

  it("clamps picks to the service quantity", () => {
    const items = buildSaleItems([
      cartFullService({
        quantity: 1,
        freebies: [
          {
            classification: "Detergent",
            choices: [
              { item: "[Detergent] Ariel", qty: 1 },
              { item: "[Detergent] Champion", qty: 1 },
            ],
          },
        ],
      }),
    ]);
    expect(items.filter(isFreeLine)).toEqual([
      { type: "item", item_name: "[Detergent] Ariel", qty: 1, price: 0 },
    ]);
  });

  it("skips cart entries of an unknown type", () => {
    expect(buildSaleItems([{ type: "mystery", name: "?" }])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// hydrateSaleItems — stored to editing
// ---------------------------------------------------------------------------
describe("hydrateSaleItems", () => {
  it("rebuilds the picks from the catalog", () => {
    const [service, ...rest] = hydrateSaleItems(storedFullService(), CATALOG);

    // The three price-0 lines are now shown inside the service's picker.
    expect(rest).toEqual([]);
    expect(service.freebies).toEqual([
      { classification: "Plastic", choices: [{ item: "Plastic", qty: 1 }] },
      {
        classification: "Detergent",
        choices: [{ item: "[Detergent] Champion", qty: 1 }],
      },
      {
        classification: "Fabcon",
        choices: [{ item: "[Fabcon] Champion", qty: 1 }],
      },
    ]);
  });

  it("reports a granted classification nobody claimed as an empty slot", () => {
    // This is what makes the unclaimed-freebie warning work without the sale
    // storing anything about what it owes.
    const stored = storedFullService().filter(
      (l) => l.item_name !== "[Fabcon] Champion"
    );
    const [service] = hydrateSaleItems(stored, CATALOG);

    expect(service.freebies.find((f) => f.classification === "Fabcon")).toEqual({
      classification: "Fabcon",
      choices: [],
    });
  });

  it("leaves a paid line alone", () => {
    const stored = [
      ...storedFullService(),
      { type: "item", item_name: "Bleach", qty: 1, price: 10 },
    ];
    expect(hydrateSaleItems(stored, CATALOG)).toContainEqual({
      type: "item",
      item_name: "Bleach",
      qty: 1,
      price: 10,
    });
  });

  it("keeps a free item the service never granted as its own line", () => {
    // Bleach is a Cleaner; Full Service grants no Cleaner. Somebody added it by
    // hand at ₱0, so it is not the service's to absorb.
    const stored = [
      ...storedFullService(),
      { type: "item", item_name: "Bleach", qty: 1, price: 0 },
    ];
    const hydrated = hydrateSaleItems(stored, CATALOG);

    expect(hydrated).toHaveLength(2);
    expect(hydrated[1]).toEqual({
      type: "item",
      item_name: "Bleach",
      qty: 1,
      price: 0,
    });
  });

  it("gives a service that grants nothing no picker at all", () => {
    const stored = [{ type: "service", service_name: "Wash", qty: 1, price: 60 }];
    expect(hydrateSaleItems(stored, CATALOG)).toEqual(stored);
  });

  it("does not let two services claim the same line", () => {
    const stored = [
      { type: "service", service_name: "Full Service", qty: 1, price: 170 },
      { type: "service", service_name: "Full Service", qty: 1, price: 170 },
      { type: "item", item_name: "Plastic", qty: 1, price: 0 },
    ];
    const [first, second] = hydrateSaleItems(stored, CATALOG);

    const claimed = (s) =>
      s.freebies.find((f) => f.classification === "Plastic").choices;
    expect(claimed(first)).toEqual([{ item: "Plastic", qty: 1 }]);
    expect(claimed(second)).toEqual([]);
  });

  it("claims up to the service quantity and leaves the surplus visible", () => {
    const stored = [
      { type: "service", service_name: "Full Service", qty: 2, price: 170 },
      { type: "item", item_name: "Plastic", qty: 3, price: 0 },
    ];
    const [service, surplus] = hydrateSaleItems(stored, CATALOG);

    expect(
      service.freebies.find((f) => f.classification === "Plastic").choices
    ).toEqual([{ item: "Plastic", qty: 2 }]);
    // The third was never the service's to give. Absorbing the whole line and
    // crediting two would have destroyed a unit of stock on open.
    expect(surplus).toEqual({
      type: "item",
      item_name: "Plastic",
      qty: 1,
      price: 0,
    });
  });

  it("survives an empty catalog by changing nothing", () => {
    // A sale opened before inventory and services have loaded. Better to show
    // the lines as they are than to invent picks against a catalog we lack.
    const stored = storedFullService();
    expect(hydrateSaleItems(stored, { services: [], inventory: [] })).toEqual(stored);
  });

  it("leaves a sale that already carries its picks untouched", () => {
    const tagged = [
      {
        type: "service",
        service_name: "Full Service",
        qty: 1,
        price: 170,
        freebies: [
          { classification: "Plastic", choices: [{ item: "Plastic", qty: 1 }] },
        ],
      },
      {
        type: "item",
        item_name: "Plastic",
        qty: 1,
        price: 0,
        is_freebie: true,
        for_service: "Full Service",
      },
    ];
    const hydrated = hydrateSaleItems(tagged, CATALOG);

    expect(hydrated).toHaveLength(1);
    expect(hydrated[0].freebies).toEqual(tagged[0].freebies);
  });
});

// ---------------------------------------------------------------------------
// flattenSaleItems — editing back to stored
// ---------------------------------------------------------------------------
describe("flattenSaleItems", () => {
  it("puts the picks back as plain price-0 lines", () => {
    const hydrated = hydrateSaleItems(storedFullService(), CATALOG);
    expect(flattenSaleItems(hydrated)).toEqual(storedFullService());
  });

  it("carries a changed pick through to the stored line", () => {
    const hydrated = hydrateSaleItems(storedFullService(), CATALOG);
    hydrated[0].freebies[1].choices[0].item = "[Detergent] Ariel";

    expect(flattenSaleItems(hydrated)).toContainEqual({
      type: "item",
      item_name: "[Detergent] Ariel",
      qty: 1,
      price: 0,
    });
  });

  it("trims picks to the service quantity", () => {
    // Set the service to qty 3, claim 3, drop it to qty 1: the sale must not
    // keep deducting stock for three.
    const hydrated = hydrateSaleItems(
      [
        { type: "service", service_name: "Full Service", qty: 3, price: 170 },
        { type: "item", item_name: "Plastic", qty: 3, price: 0 },
      ],
      CATALOG
    );
    hydrated[0].qty = 1;

    expect(flattenSaleItems(hydrated).filter(isFreeLine)).toEqual([
      { type: "item", item_name: "Plastic", qty: 1, price: 0 },
    ]);
  });

  it("leaves hand-added lines alone", () => {
    const manual = { type: "item", item_name: "Bleach", qty: 1, price: 10 };
    const hydrated = hydrateSaleItems([...storedFullService(), manual], CATALOG);
    expect(flattenSaleItems(hydrated)).toContainEqual(manual);
  });

  it("migrates a sale that was stored with its picks nested", () => {
    const tagged = [
      {
        type: "service",
        service_name: "Full Service",
        qty: 1,
        price: 170,
        freebies: [
          { classification: "Plastic", choices: [{ item: "Plastic", qty: 1 }] },
        ],
      },
      {
        type: "item",
        item_name: "Plastic",
        qty: 1,
        price: 0,
        is_freebie: true,
        for_service: "Full Service",
      },
    ];

    // Saving one of these writes it back flat, so the shape heals on edit.
    expect(flattenSaleItems(tagged)).toEqual([
      { type: "service", service_name: "Full Service", qty: 1, price: 170 },
      { type: "item", item_name: "Plastic", qty: 1, price: 0 },
    ]);
  });

  it("leaves an already-flat sale untouched", () => {
    expect(flattenSaleItems(storedFullService())).toEqual(storedFullService());
  });
});

// ---------------------------------------------------------------------------
// The round trip
// ---------------------------------------------------------------------------
describe("hydrate → flatten", () => {
  it("returns a stored sale unchanged when nothing was edited", () => {
    const stored = storedFullService();
    expect(flattenSaleItems(hydrateSaleItems(stored, CATALOG))).toEqual(stored);
  });

  /**
   * Total units per item/service name, ignoring order.
   *
   * The property below cannot assert deep equality. With several services on one
   * sale there is genuinely no record of which service a free line came from —
   * that is the cost of not storing the ownership — so opening and saving can
   * regroup the picks under a different service, or split an over-claimed line.
   * What must never change is what the customer gets and what stock moves.
   */
  const tally = (items) =>
    items.reduce((acc, line) => {
      const name = line.service_name ?? line.item_name;
      const key = `${line.type}:${name}:${line.price}`;
      acc[key] = (acc[key] || 0) + (Number(line.qty) || 0);
      return acc;
    }, {});

  it("moves no stock and changes no line when the cart's output is round-tripped", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constant("service"),
            id: fc.integer({ min: 1, max: 3 }),
            name: fc.constant("Full Service"),
            price: fc.integer({ min: 1, max: 500 }),
            quantity: fc.integer({ min: 1, max: 4 }),
            freebies: fc.constantFrom(
              [{ classification: "Plastic", choices: [{ item: "Plastic", qty: 1 }] }],
              [
                {
                  classification: "Detergent",
                  choices: [{ item: "[Detergent] Ariel", qty: 1 }],
                },
              ],
              [{ classification: "Fabcon", choices: [] }]
            ),
          }),
          { maxLength: 3 }
        ),
        (cart) => {
          const stored = buildSaleItems(cart);
          const roundTripped = flattenSaleItems(hydrateSaleItems(stored, CATALOG));

          expect(tally(roundTripped)).toEqual(tally(stored));
          expect(roundTripped.some((l) => "freebies" in l)).toBe(false);
        }
      )
    );
  });

  it("keeps a single service's sale identical, order included", () => {
    // The realistic case, and the one the user sees: one service, its picks
    // stored right after it.
    const stored = buildSaleItems([cartFullService()]);
    expect(flattenSaleItems(hydrateSaleItems(stored, CATALOG))).toEqual(stored);
  });

  it("loses nothing when a sale carries more freebies than it was owed", () => {
    const stored = [
      { type: "service", service_name: "Full Service", qty: 1, price: 170 },
      { type: "item", item_name: "Plastic", qty: 3, price: 0 },
    ];
    expect(tally(flattenSaleItems(hydrateSaleItems(stored, CATALOG)))).toEqual(
      tally(stored)
    );
  });

  it("never writes freebie state back to storage", () => {
    const flat = flattenSaleItems(hydrateSaleItems(storedFullService(), CATALOG));
    expect(flat.some((l) => "freebies" in l)).toBe(false);
    expect(flat.some((l) => "is_freebie" in l)).toBe(false);
    expect(flat.some((l) => "for_service" in l)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isFreeLine
// ---------------------------------------------------------------------------
describe("isFreeLine", () => {
  it("recognises a freebie stored as a bare price-0 item line", () => {
    const [service, plastic, detergent, fabcon] = storedFullService();

    expect(isFreeLine(service)).toBe(false);
    expect(isFreeLine(plastic)).toBe(true);
    expect(isFreeLine(detergent)).toBe(true);
    expect(isFreeLine(fabcon)).toBe(true);
  });

  it("recognises a tagged freebie too", () => {
    expect(isFreeLine({ type: "item", item_name: "X", qty: 1, is_freebie: true })).toBe(
      true
    );
  });

  it("leaves a line the customer paid for alone", () => {
    expect(isFreeLine({ type: "item", item_name: "Bleach", qty: 1, price: 10 })).toBe(
      false
    );
  });

  // The service price arrives from Postgres as a numeric string.
  it("does not mistake a priced string for free", () => {
    expect(isFreeLine({ type: "service", service_name: "Wash", price: "170.00" })).toBe(
      false
    );
  });

  it("is broader than isFreebieLine, which stays tag-only", () => {
    const untagged = storedFullService()[1];
    expect(isFreeLine(untagged)).toBe(true);
    expect(isFreebieLine(untagged)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// displayLines
// ---------------------------------------------------------------------------
describe("displayLines", () => {
  it("passes a flat sale straight through", () => {
    // Nothing is stored twice, so there is nothing to fold.
    expect(displayLines(storedFullService())).toEqual(storedFullService());
  });

  it("folds a nested freebie so an older sale prints it once", () => {
    const tagged = [
      {
        type: "service",
        service_name: "Full Service",
        qty: 1,
        price: 170,
        freebies: [
          { classification: "Plastic", choices: [{ item: "Plastic", qty: 1 }] },
        ],
      },
      {
        type: "item",
        item_name: "Plastic",
        qty: 1,
        price: 0,
        is_freebie: true,
        for_service: "Full Service",
      },
    ];
    expect(displayLines(tagged)).toEqual([tagged[0]]);
  });

  it("keeps a price-0 line that has no service to nest under", () => {
    const legacy = [
      { type: "service", service_name: "Wash", qty: 1, price: 60 },
      { type: "item", item_name: "Plastic", qty: 1, price: 0 },
    ];
    expect(displayLines(legacy)).toEqual(legacy);
  });
});
