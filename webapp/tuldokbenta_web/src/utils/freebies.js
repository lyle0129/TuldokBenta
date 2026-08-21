// utils/freebies.js
// Finds freebies a service granted but nobody claimed.
//
// A service grants one free pick per unit sold from each classification it
// lists. `freebieLinesFor` silently drops choices with no item selected, so an
// unclaimed or half-filled freebie used to leave no trace at all — the sale
// just saved with the customer never getting what they paid for.
//
// Cart lines and saved sale lines carry the same `freebies` array but disagree
// on the quantity field (`quantity` vs `qty`) and the name field, hence one
// core function plus two thin adapters.

/**
 * @typedef {{ serviceName: string, classification: string, unclaimed: number, hasEmptyPick: boolean }} FreebieGap
 */

/**
 * @param {{name: string, qty: number, freebies: Array}[]} serviceLines
 * @returns {FreebieGap[]} one entry per classification that isn't fully spoken for
 */
export const freebieGaps = (serviceLines = []) =>
  serviceLines.flatMap(({ name, qty, freebies }) => {
    // `freebies` is JSONB server-side and can come back null.
    if (!Array.isArray(freebies)) return [];

    const slots = Number(qty) || 0;

    return freebies.flatMap((f) => {
      const choices = Array.isArray(f?.choices) ? f.choices : [];
      const claimed = choices.reduce((sum, c) => sum + (Number(c?.qty) || 0), 0);
      const unclaimed = Math.max(0, slots - claimed);
      // A row added but left on "-- Select --". It counts against the slot
      // total yet produces no stock line, so it needs flagging separately.
      const hasEmptyPick = choices.some((c) => !c?.item);

      if (unclaimed === 0 && !hasEmptyPick) return [];

      return [
        {
          serviceName: name,
          classification: f?.classification ?? "",
          unclaimed,
          hasEmptyPick,
        },
      ];
    });
  });

/** Cart shape: `{ type: "service", name, quantity, freebies }`. */
export const freebieGapsFromCart = (cart = []) =>
  freebieGaps(
    cart
      .filter((line) => line?.type === "service")
      .map((line) => ({
        name: line.name,
        qty: line.quantity,
        freebies: line.freebies,
      }))
  );

/** Saved sale shape: `{ type: "service", service_name, qty, freebies }`. */
export const freebieGapsFromSaleItems = (items = []) =>
  freebieGaps(
    items
      .filter((line) => line?.type === "service")
      .map((line) => ({
        name: line.service_name,
        qty: line.qty,
        freebies: line.freebies,
      }))
  );

/**
 * Trims freebie choices so no classification claims more than `slots` picks.
 *
 * `freebieGaps` above only reports *under*-claiming, which leaves the opposite
 * mistake unguarded: lowering a service's quantity after its freebies were
 * claimed strands the surplus. Every surplus pick becomes a real price-0
 * inventory line the backend deducts stock for, so a service taken from qty 3
 * down to qty 1 would keep giving away three items.
 *
 * Choices are spent in order against a running budget — the earlier picks are
 * the ones the cashier made first, so they're the ones to keep.
 *
 * @param {{classification: string, choices: {item: string, qty: number}[]}[]} freebies
 * @param {number} slots free picks available per classification
 */
export const clampFreebieChoices = (freebies = [], slots) => {
  if (!Array.isArray(freebies)) return freebies;
  const budget = Math.max(0, Number(slots) || 0);

  return freebies.map((f) => {
    const choices = Array.isArray(f?.choices) ? f.choices : [];
    let left = budget;

    const clamped = [];
    for (const choice of choices) {
      if (left <= 0) break; // budget spent — the rest of the picks are surplus
      const qty = Math.max(1, Math.floor(Number(choice?.qty) || 1));
      const allowed = Math.min(qty, left);
      clamped.push(allowed === qty ? choice : { ...choice, qty: allowed });
      left -= allowed;
    }

    // Same array when nothing was trimmed, so React sees no change.
    return clamped.length === choices.length &&
      clamped.every((c, i) => c === choices[i])
      ? f
      : { ...f, choices: clamped };
  });
};

/**
 * Human-readable lines for the confirmation dialog, e.g.
 * "Full Service — 1 Detergent not claimed" / "Full Service — a Plastic freebie has no item chosen".
 */
export const describeFreebieGaps = (gaps = []) =>
  gaps.map(({ serviceName, classification, unclaimed, hasEmptyPick }) => {
    const parts = [];
    if (unclaimed > 0) parts.push(`${unclaimed} ${classification} not claimed`);
    if (hasEmptyPick) parts.push(`a ${classification} freebie has no item chosen`);
    return `${serviceName} — ${parts.join(", ")}`;
  });
