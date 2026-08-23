// utils/auditLabels.js
// Naming the things an audit row refers to: a field inside `changes`, and the
// action itself.
//
// Both are mechanical transforms over strings that come out of the database, so
// they live here rather than in a component — the audit filters, the event list
// and the change summary all need them, and a copy in each is how three screens
// end up spelling the same action three ways.

/**
 * Field names worth spelling out. Everything else is title-cased mechanically.
 *
 * A plain object rather than a Map is fine only because every read goes through
 * Object.hasOwn below — see the note there.
 */
const LABELS = {
  invoice_number: "Invoice",
  item_name: "Item",
  service_name: "Service",
  full_name: "Name",
  is_active: "Active",
  shop_ids: "Shops",
  paid_using: "Paid using",
  paid_at: "Paid at",
  created_at: "Created at",
  line_count: "Lines",
  receipt_paper_width_mm: "Receipt width (mm)",
  must_change_password: "Must change password",
  reorder_level: "Reorder level",
};

/**
 * "reorder_level" → "Reorder level".
 *
 * Object.hasOwn rather than a truthiness check on LABELS[key]. The keys here
 * come from a JSONB payload, so `key` can be any string at all — and a plain
 * object literal answers `LABELS["valueOf"]` with Object.prototype.valueOf, a
 * function, which would be returned as the label and rendered as source code.
 */
export const fieldLabel = (key) => {
  if (Object.hasOwn(LABELS, key)) return LABELS[key];
  const words = String(key).replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * "sale.date_corrected" → "Sale · Date corrected".
 *
 * Derived from the action string rather than looked up in a table. The backend's
 * ACTIONS vocabulary is the only place those strings are written down, and a
 * second copy here would drift the moment an action is added — showing a raw
 * `shop.reactivate` for something the log already knows about.
 */
export const actionLabel = (action) => {
  const [group, ...rest] = String(action ?? "").split(".");
  const verb = rest.join(".");
  return verb ? `${fieldLabel(group)} · ${fieldLabel(verb)}` : fieldLabel(group);
};
