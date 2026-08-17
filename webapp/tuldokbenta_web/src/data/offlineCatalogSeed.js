// data/offlineCatalogSeed.js
//
// Last-resort catalog for the offline sales page, used only when nothing has
// ever been cached from the server (a brand new device that has not yet been
// online). Normal operation caches the real inventory and services instead —
// see useOfflineCatalog.
//
// This will drift from the database. Treat it as a starting point, not a
// source of truth: the page warns when it is running on these values.

export const SEED_INVENTORY = [
  { id: 1, item_name: "[Detergent] Ariel", item_classification: "Detergent", price: 15, stock: 0 },
  { id: 2, item_name: "[Detergent] Tide", item_classification: "Detergent", price: 15, stock: 0 },
  { id: 3, item_name: "[Detergent] Surf", item_classification: "Detergent", price: 15, stock: 0 },
  { id: 4, item_name: "[Detergent] Breeze", item_classification: "Detergent", price: 15, stock: 0 },
  { id: 5, item_name: "[Detergent] Champion", item_classification: "Detergent", price: 15, stock: 0 },
  { id: 6, item_name: "[Fabcon] Downy Pink", item_classification: "Fabcon", price: 15, stock: 0 },
  { id: 8, item_name: "[Fabcon] Downy Blue", item_classification: "Fabcon", price: 15, stock: 0 },
  { id: 9, item_name: "[Fabcon] Surf", item_classification: "Fabcon", price: 15, stock: 0 },
  { id: 10, item_name: "[Fabcon] Champion", item_classification: "Fabcon", price: 15, stock: 0 },
  { id: 11, item_name: "[Fabcon] Del", item_classification: "Fabcon", price: 15, stock: 0 },
  // Title-cased to match the others: freebie filtering compares classification
  // strings exactly, so a lowercase "bleach" silently matches no items.
  { id: 12, item_name: "Bleach", item_classification: "Bleach", price: 10, stock: 0 },
  { id: 13, item_name: "Plastic", item_classification: "Plastic", price: 3, stock: 0 },
];

export const SEED_SERVICES = [
  { id: 1, service_name: "Full Service", price: 170.0, freebies: ["Plastic", "Detergent", "Fabcon"] },
  { id: 2, service_name: "Wash", price: 60.0, freebies: [] },
  { id: 3, service_name: "Dry", price: 60.0, freebies: [] },
  { id: 4, service_name: "Extra Wash", price: 30.0, freebies: [] },
  { id: 5, service_name: "Extra Dry", price: 30.0, freebies: [] },
  { id: 6, service_name: "Fold", price: 20, freebies: [] },
];