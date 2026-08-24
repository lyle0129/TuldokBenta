// data/sampleReceipt.js
//
// The sale the receipt preview renders. Fixed values throughout, with no
// Date.now() anywhere: the preview re-renders on every keystroke in the settings
// form, and a moving timestamp would make the whole receipt flicker while
// somebody is only trying to fix a phone number.
//
// The items are in the STORED shape described at the top of
// utils/buildSaleItems.js — a service line carrying nothing but itself, and a
// claimed freebie as an ordinary price-0 item line. That is the shape real sales
// have, so the preview shows what a receipt actually looks like rather than a
// tidied-up version of one.

export const SAMPLE_SALE = {
  invoice_number: "INV-0042",
  customer_name: "Maria Santos",
  created_at: "2025-01-15T09:30:00.000Z",
  paid_at: "2025-01-15T11:05:00.000Z",
  items: [
    {
      type: "service",
      service_name: "Wash & Fold — 8kg",
      price: 180,
      qty: 1,
    },
    {
      type: "item",
      item_name: "Detergent Powder 60g",
      price: 25,
      qty: 2,
    },
    // The freebie that came with the service, priced at zero — which is both how
    // it is recorded and how the backend knows to deduct its stock.
    {
      type: "item",
      item_name: "Fabric Softener 30ml",
      price: 0,
      qty: 1,
    },
  ],
};
