// utils/buildSaleItems.js
// Converts cart state into the flat `items` array a sale is stored as, and
// keeps freebie lines in sync when a sale is later edited.
//
// Previously duplicated character-for-character between OpenSales.jsx and
// OpenSalesOffline.jsx, which meant any freebie fix had to be made twice.

/**
 * Freebie lines are real inventory lines (the backend deducts stock for them)
 * but they're derived from the service that granted them, not chosen
 * independently. Tagging them lets the edit modal regenerate them without
 * touching lines the user added by hand.
 */
export const isFreebieLine = (line) => !!line?.is_freebie;

/** The price-0 inventory lines a service's freebie selections expand into. */
export const freebieLinesFor = (serviceName, freebies = []) =>
  freebies.flatMap(
    (f) =>
      f.choices
        ?.filter((c) => c.item)
        .map((c) => ({
          type: "item",
          item_name: c.item,
          qty: Number(c.qty) || 1,
          price: 0,
          is_freebie: true,
          for_service: serviceName,
        })) || []
  );

/**
 * Flattens a cart into the sale `items` array.
 *
 * A service emits two things: the service line itself, carrying its `freebies`
 * array so the sale stays editable, and sibling price-0 item lines so the
 * backend deducts stock for the freebies. The `freebies` array used to be
 * dropped here, which is why the freebie editor never rendered for any sale
 * loaded back from the server.
 */
export const buildSaleItems = (cart) =>
  cart.flatMap((i) => {
    if (i.type === "inventory") {
      return [{ type: "item", item_name: i.name, qty: i.quantity, price: i.price }];
    }

    if (i.type === "service") {
      const freebies = i.freebies || [];
      return [
        {
          type: "service",
          service_name: i.name,
          qty: i.quantity,
          price: i.price,
          freebies,
        },
        ...freebieLinesFor(i.name, freebies),
      ];
    }

    return [];
  });

/**
 * Rebuilds every derived freebie line from the current service lines.
 *
 * Call before saving an edit: without it, changing a service's quantity or its
 * freebie choices leaves the old price-0 lines behind, so the stock deducted
 * for freebies drifts away from the service that granted them.
 *
 * Lines belonging to services that no longer carry a `freebies` array (older
 * sales saved before this change) are left exactly as they are.
 */
export const syncFreebieLines = (items = []) => {
  const managedServices = new Set(
    items
      .filter((it) => it.type === "service" && Array.isArray(it.freebies))
      .map((it) => it.service_name)
  );

  const result = [];
  for (const line of items) {
    // Drop the stale derived lines; they're re-emitted from their service below.
    if (isFreebieLine(line) && managedServices.has(line.for_service)) continue;

    result.push(line);

    if (line.type === "service" && Array.isArray(line.freebies)) {
      result.push(...freebieLinesFor(line.service_name, line.freebies));
    }
  }
  return result;
};
