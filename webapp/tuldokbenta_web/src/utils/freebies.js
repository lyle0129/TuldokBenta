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
