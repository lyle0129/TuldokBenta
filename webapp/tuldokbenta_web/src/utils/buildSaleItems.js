// utils/buildSaleItems.js
// Converts between the two shapes a sale's freebies take.
//
// STORED (what goes in the `items` JSONB, and what every report and receipt
// reads) is flat. A service line carries nothing but itself, and each freebie is
// an ordinary price-0 item line:
//
//   [ { qty: 1, type: "service", price: "170.00", service_name: "Full Service" },
//     { qty: 1, type: "item", price: 0, item_name: "Plastic" },
//     { qty: 1, type: "item", price: 0, item_name: "[Detergent] Champion" },
//     { qty: 1, type: "item", price: 0, item_name: "[Fabcon] Champion" } ]
//
// EDITED carries, on each service line, a `freebies` array pairing every
// classification the service grants with the picks made against it. That shape
// is what drives the freebie picker and the unclaimed-freebie warning — and it
// is never written to the database. `hydrate` builds it on the way in, `flatten`
// takes it back off on the way out.
//
// Keeping it out of storage is deliberate: the granted classifications belong to
// the service catalog, not to a copy frozen onto every sale, and a stored copy
// goes stale the moment a service's freebies are edited.

import { clampFreebieChoices } from "./freebies";

/**
 * Was this line generated from a service's freebie picks?
 *
 * Only ever true for sales written during the window when the tag was stored.
 * It answers one question — "is this line derived, and therefore mine to
 * regenerate" — so it must stay tag-only: widening it would make an edit start
 * rewriting price-0 lines that were added by hand.
 */
export const isFreebieLine = (line) => !!line?.is_freebie;

/**
 * A line the customer paid nothing for: tagged as a freebie, or priced at zero.
 *
 * This is the one to ask when *displaying* a line, because a freebie normally
 * reaches the sale as nothing more than a price-0 item line with no tag at all.
 * Anything that checks only `is_freebie` reports those as ordinary items bought
 * for ₱0.
 */
export const isFreeLine = (line) =>
  isFreebieLine(line) || Number(line?.price || 0) === 0;

/** The stored price-0 item lines a set of freebie picks flattens into. */
export const freebieLinesFor = (freebies = []) =>
  freebies.flatMap(
    (f) =>
      f.choices
        ?.filter((c) => c.item)
        .map((c) => ({
          type: "item",
          item_name: c.item,
          qty: Number(c.qty) || 1,
          price: 0,
        })) || []
  );

/**
 * Flattens a cart into the stored `items` array.
 *
 * A service emits its own line — carrying no freebie state — plus one plain
 * price-0 item line per pick, which is both how the freebie is recorded and how
 * the backend knows to deduct stock for it.
 */
export const buildSaleItems = (cart) =>
  cart.flatMap((i) => {
    if (i.type === "inventory") {
      return [{ type: "item", item_name: i.name, qty: i.quantity, price: i.price }];
    }

    if (i.type === "service") {
      return [
        { type: "service", service_name: i.name, qty: i.quantity, price: i.price },
        ...freebieLinesFor(clampFreebieChoices(i.freebies || [], i.quantity)),
      ];
    }

    return [];
  });

/**
 * Editing shape → stored shape.
 *
 * Call before saving an edit. Each service's picks become plain price-0 lines
 * again and the `freebies` array comes off, so what lands in the database is the
 * flat shape and nothing else.
 *
 * Picks are clamped to the service's own quantity on the way through. Lowering a
 * service from qty 3 to qty 1 after three freebies were claimed would otherwise
 * leave the surplus behind, and every surplus pick is a real line the backend
 * deducts stock for.
 */
export const flattenSaleItems = (items = []) => {
  const result = [];

  for (const line of items) {
    // Derived lines from an already-tagged sale: their service carries the
    // picks, so they're re-emitted below rather than kept.
    if (isFreebieLine(line)) continue;

    if (line?.type === "service" && Array.isArray(line.freebies)) {
      const { freebies, ...bare } = line;
      result.push(bare);
      result.push(...freebieLinesFor(clampFreebieChoices(freebies, line.qty)));
      continue;
    }

    result.push(line);
  }

  return result;
};

/**
 * Stored shape → editing shape.
 *
 * Rebuilds each service line's `freebies` from the catalog: the service says
 * which classifications it grants, inventory says which classification each
 * price-0 line belongs to, and the two together say which pick satisfies which
 * grant. A granted classification with nothing matching it comes back with no
 * choices, which is exactly what the unclaimed-freebie warning looks for.
 *
 * A price-0 line absorbed into a service disappears from the top level — it is
 * shown and edited inside that service's picker instead. One that matches
 * nothing granted stays where it is as an ordinary line, because it is one: a
 * free item somebody added by hand, not a freebie the service owes.
 *
 * Sales already carrying a `freebies` array keep theirs untouched; saving them
 * flattens them to the stored shape.
 *
 * @param {Array}  items      the sale's stored lines
 * @param {object} catalog
 * @param {Array}  catalog.services  [{ service_name, freebies: string[] }]
 * @param {Array}  catalog.inventory [{ item_name, item_classification }]
 */
export const hydrateSaleItems = (
  items = [],
  { services = [], inventory = [] } = {}
) => {
  const grantsFor = new Map(
    services.map((s) => [
      s.service_name,
      Array.isArray(s.freebies) ? s.freebies : [],
    ])
  );
  const classOf = new Map(
    inventory.map((i) => [i.item_name, i.item_classification])
  );

  const qtyOf = (line) => Math.max(1, Number(line?.qty) || 1);

  /**
   * Units of each free line not yet claimed by a service.
   *
   * Counted rather than flagged so a line can be claimed in part. A service
   * granting one Plastic, on a sale carrying three free ones, takes one unit and
   * leaves the other two as a line of their own — visible, and still deducting
   * the stock they always did. Absorbing the whole line and crediting one unit
   * would quietly destroy the other two.
   */
  const unclaimed = new Map();
  const leftOn = (idx) =>
    unclaimed.has(idx) ? unclaimed.get(idx) : qtyOf(items[idx]);

  /** index of a service line → the freebies array rebuilt for it. */
  const rebuilt = new Map();

  const claimable = (line) =>
    line?.type !== "service" && isFreeLine(line) && !isFreebieLine(line);

  items.forEach((line, i) => {
    if (line?.type !== "service") return;
    if (Array.isArray(line.freebies)) return; // already in the editing shape

    const granted = grantsFor.get(line.service_name);
    if (!granted?.length) return;

    const slots = qtyOf(line);

    rebuilt.set(
      i,
      granted.map((classification) => {
        const choices = [];
        let slotsLeft = slots;

        for (let j = 0; j < items.length && slotsLeft > 0; j++) {
          const candidate = items[j];
          if (!claimable(candidate)) continue;
          if (classOf.get(candidate.item_name) !== classification) continue;

          const available = leftOn(j);
          if (available <= 0) continue;

          const take = Math.min(available, slotsLeft);
          choices.push({ item: candidate.item_name, qty: take });
          unclaimed.set(j, available - take);
          slotsLeft -= take;
        }

        return { classification, choices };
      })
    );
  });

  return items.reduce((acc, line, i) => {
    if (isFreebieLine(line)) return acc; // derived; its service carries it
    if (rebuilt.has(i)) {
      acc.push({ ...line, freebies: rebuilt.get(i) });
      return acc;
    }

    if (unclaimed.has(i)) {
      const left = unclaimed.get(i);
      if (left <= 0) return acc; // wholly absorbed into a service's picker
      if (left !== qtyOf(line)) {
        acc.push({ ...line, qty: left }); // the surplus, on its own line
        return acc;
      }
    }

    acc.push(line);
    return acc;
  }, []);
};

/**
 * The lines a receipt should list.
 *
 * Only matters for sales written while freebies were stored twice over — once
 * nested under the service and once as a tagged price-0 line. The receipt prints
 * the nested copy, so listing the raw array printed those freebies a second time
 * as ordinary 0.00 rows. A flat sale has nothing to fold and passes straight
 * through.
 */
export const displayLines = (items = []) => {
  const managed = new Set(
    items
      .filter((it) => it?.type === "service" && Array.isArray(it.freebies))
      .map((it) => it.service_name)
  );
  return items.filter(
    (line) => !(isFreebieLine(line) && managed.has(line.for_service))
  );
};
