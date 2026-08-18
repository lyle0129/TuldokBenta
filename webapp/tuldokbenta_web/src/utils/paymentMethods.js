// utils/paymentMethods.js
// Turning a stored `paid_using` code into something a report can render.
//
// Sales store the payment method as a bare string and always have — the
// payment_methods table is a source list and a label lookup, never a foreign
// key. That means a code can outlive its row (deleted method, hand-inserted
// sale), so every resolver here has to degrade to something readable rather
// than blank out a cell.
//
// This also replaces the icon ternary that used to be duplicated verbatim in
// PaymentBreakdownChart and TodaysSummary, neither of which knew about any
// method beyond cash/gcash/card.

import {
  Banknote,
  Smartphone,
  CreditCard,
  Wallet,
  Landmark,
  Ticket,
} from "lucide-react";

/** Icon slug to component. Slugs are stored in payment_methods.icon. */
export const PAYMENT_ICONS = {
  banknote: Banknote,
  smartphone: Smartphone,
  "credit-card": CreditCard,
  wallet: Wallet,
  landmark: Landmark,
  ticket: Ticket,
};

/** What a method with no icon, or an icon slug we no longer ship, falls back to. */
export const FALLBACK_ICON = Wallet;

/** The picker's options, in the order they are offered. */
export const PAYMENT_ICON_OPTIONS = [
  { slug: "banknote", label: "Cash" },
  { slug: "smartphone", label: "E-wallet" },
  { slug: "credit-card", label: "Card" },
  { slug: "landmark", label: "Bank" },
  { slug: "ticket", label: "Voucher" },
  { slug: "wallet", label: "Other" },
];

/**
 * Colour per method, assigned by position in the list.
 *
 * Lived in PaymentBreakdownChart; shared so the pie slice and the totals card
 * for the same method are not different colours.
 */
export const PAYMENT_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
];

/**
 * The stable identifier a label is filed under.
 *
 * Mirrors slugifyCode() in paymentMethodsController — this one pre-fills the
 * field so the admin sees what will be stored, the server normalises again
 * because the result is written to paid_using permanently.
 */
export const slugifyCode = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** "bank-transfer" -> "Bank Transfer", for codes with no row to name them. */
const titleCase = (code) =>
  String(code ?? "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** @param {Array} methods rows from /payment-methods */
export const buildMethodLookup = (methods = []) =>
  new Map(methods.map((m) => [m.code, m]));

/**
 * Everything needed to render one payment method.
 *
 * @param {Map} lookup from buildMethodLookup
 * @param {string} code a raw `paid_using` value
 * @returns {{label: string, Icon: Function, known: boolean}}
 */
export const resolveMethod = (lookup, code) => {
  const method = lookup?.get(code);
  if (method) {
    return {
      label: method.label,
      Icon: PAYMENT_ICONS[method.icon] || FALLBACK_ICON,
      known: true,
    };
  }
  return {
    label: titleCase(code) || "Unknown",
    Icon: FALLBACK_ICON,
    known: false,
  };
};
