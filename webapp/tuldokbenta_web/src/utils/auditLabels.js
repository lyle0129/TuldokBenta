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
  customer_name: "Customer",
  item_classification: "Category",
  orderedIds: "New order",
  // inventory.restock writes this alongside the before/after pair. "Amount" on
  // its own reads like a peso total next to a stock count that isn't one.
  amount: "Amount added",
};

/**
 * What `entity_type` is called out loud.
 *
 * The column holds the table's own vocabulary — `open_sale`, `payment_method` —
 * and printing it raw was the loudest developer tell on the card. Unlike
 * `actionLabel`, which can derive a decent label by splitting on ".", these
 * need naming: nothing mechanical turns "open_sale" into "Unpaid sale", and
 * "Open sale" means nothing to a shop owner who has never seen the schema.
 */
const ENTITY_LABELS = {
  open_sale: "Unpaid sale",
  closed_sale: "Paid sale",
  inventory: "Item",
  service: "Service",
  payment_method: "Payment method",
  user: "User",
  shop: "Shop",
};

/**
 * "open_sale" → "Unpaid sale". Falls back to mechanical title-casing.
 *
 * Object.hasOwn for the same reason fieldLabel uses it: the value comes from
 * the database, so it can be any string, and a plain object answers
 * `ENTITY_LABELS["constructor"]` with a function.
 */
export const entityLabel = (type) => {
  if (Object.hasOwn(ENTITY_LABELS, type)) return ENTITY_LABELS[type];
  return fieldLabel(type ?? "entity");
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

/**
 * A colour per kind of action, as a left border and a matching title.
 *
 * Deliberately four tones and a default rather than one per action. A colour
 * for everything is the same as no colour at all — the point is that a deletion
 * is findable while scrolling a hundred events, and that only works if red is
 * rare on the page. Colour is never the only signal either: the label beside it
 * says the same thing, so the log reads identically to someone who cannot
 * distinguish red from green.
 *
 * Tailwind classes rather than hex, and written out in full, because the build
 * scans source text for class names — a composed string like
 * `border-l-${colour}-500` would be emitted by nobody and render as no border.
 */
const TONES = {
  destructive: {
    border: "border-l-red-500",
    text: "text-red-700 dark:text-red-400",
  },
  creative: {
    border: "border-l-green-500",
    text: "text-green-700 dark:text-green-400",
  },
  altering: {
    border: "border-l-amber-500",
    text: "text-amber-700 dark:text-amber-400",
  },
  money: {
    border: "border-l-blue-500",
    text: "text-blue-700 dark:text-blue-400",
  },
  neutral: {
    border: "border-l-gray-300 dark:border-l-gray-600",
    text: "text-gray-900 dark:text-gray-100",
  },
};

/**
 * The verbs that share a tone. Anything unlisted — `auth.login`, and whatever
 * the next controller adds — stays neutral, which is the right default: a new
 * action showing up uncoloured is a missing nicety, whereas guessing at a tone
 * could paint a deletion green.
 *
 * Keyed on the verb rather than the whole action, because what a scanning
 * reader wants to pick out is deletions, not deletions-of-services
 * specifically. Each verb in the backend's ACTIONS vocabulary means the same
 * thing across all seven entity types.
 */
const VERB_TONES = {
  delete: "destructive",
  deactivate: "destructive",
  login_failed: "destructive",
  create: "creative",
  reactivate: "creative",
  restock: "creative",
  update: "altering",
  reorder: "altering",
  date_corrected: "altering",
  shops_changed: "altering",
  password_reset: "altering",
  password_changed: "altering",
  pay: "money",
  revert: "money",
};

/**
 * The tone for one action string.
 *
 * Object.hasOwn for the same reason fieldLabel uses it, and it matters more
 * here: `action` comes straight from the database, and a plain object answers
 * `VERB_TONES["toString"]` with a function — which would then be used as a key
 * into TONES, yield undefined, and throw on the `.border` the caller reads.
 */
export const toneFor = (action) => {
  const verb = String(action ?? "").split(".").slice(1).join(".");
  return Object.hasOwn(VERB_TONES, verb) ? TONES[VERB_TONES[verb]] : TONES.neutral;
};
