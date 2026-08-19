/**
 * Feature: database-driven payment methods
 * Subject: utils/paymentMethods.js, components/sales-modals/PaySaleModal.jsx,
 *          utils/reportMetrics.js, components/charts/PaymentBreakdownChart.jsx
 *
 * The list of payment methods moved out of two hardcoded <option> tags and into
 * a table. Two properties have to hold for that to be safe:
 *
 *   1. The wire format did not change — the modal still hands `onConfirm` the
 *      bare code string that goes straight into `paid_using`.
 *   2. A method the code has never heard of is rendered everywhere, rather than
 *      being silently dropped. The report's payment panel used to hold
 *      `{cash, gcash}` and contribute ₱0 for anything else — the bug this pins.
 */
import React from "react";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { slugifyCode, resolveMethod, buildMethodLookup } from "../utils/paymentMethods";
import PaySaleModal from "../components/sales-modals/PaySaleModal";
import PaymentBreakdownChart from "../components/charts/PaymentBreakdownChart";
import { paymentBreakdown } from "../utils/reportMetrics";
import { renderWithQuery } from "./utils/renderWithQuery.jsx";

const METHODS = [
  { id: 1, code: "cash", label: "Cash", icon: "banknote", is_active: true, sort_order: 1 },
  { id: 2, code: "gcash", label: "GCash", icon: "smartphone", is_active: true, sort_order: 2 },
  { id: 3, code: "maya", label: "Maya", icon: "smartphone", is_active: true, sort_order: 3 },
  { id: 4, code: "old-card", label: "Old Card", icon: null, is_active: false, sort_order: 4 },
];

/** Serves the method list to any component that reads it through the cache. */
const mockMethodsFetch = (methods = METHODS) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => methods }))
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("slugifyCode", () => {
  it("lowercases and hyphenates a display name", () => {
    expect(slugifyCode("Bank Transfer")).toBe("bank-transfer");
  });

  it("strips punctuation and collapses runs of separators", () => {
    expect(slugifyCode("  GCash / Maya!!  ")).toBe("gcash-maya");
  });

  it("never leaves a leading or trailing hyphen", () => {
    expect(slugifyCode("---Cash---")).toBe("cash");
  });

  it("returns an empty string when nothing usable is left", () => {
    expect(slugifyCode("!!!")).toBe("");
    expect(slugifyCode(null)).toBe("");
  });
});

describe("resolveMethod", () => {
  const lookup = buildMethodLookup(METHODS);

  it("returns the configured label and icon for a known code", () => {
    const { label, known } = resolveMethod(lookup, "gcash");
    expect(label).toBe("GCash");
    expect(known).toBe(true);
  });

  it("still resolves a method that has been deactivated", () => {
    expect(resolveMethod(lookup, "old-card").label).toBe("Old Card");
  });

  /** A method deleted after sales referenced it must still render readably. */
  it("falls back to a title-cased version of an unknown code", () => {
    const { label, known } = resolveMethod(lookup, "bank-transfer");
    expect(label).toBe("Bank Transfer");
    expect(known).toBe(false);
  });

  it("labels a missing code rather than rendering nothing", () => {
    expect(resolveMethod(lookup, "").label).toBe("Unknown");
    expect(resolveMethod(lookup, undefined).label).toBe("Unknown");
  });
});

describe("PaySaleModal", () => {
  const sale = { id: 7, invoice_number: "INV-0001" };

  it("offers the active methods from the table, not a hardcoded pair", async () => {
    mockMethodsFetch();
    renderWithQuery(<PaySaleModal sale={sale} onClose={() => {}} onConfirm={() => {}} />);

    await waitFor(() => expect(screen.getByRole("option", { name: "Maya" })).toBeTruthy());
    expect(screen.getByRole("option", { name: "Cash" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "GCash" })).toBeTruthy();
  });

  it("hides a deactivated method", async () => {
    mockMethodsFetch();
    renderWithQuery(<PaySaleModal sale={sale} onClose={() => {}} onConfirm={() => {}} />);

    await waitFor(() => expect(screen.getByRole("option", { name: "Maya" })).toBeTruthy());
    expect(screen.queryByRole("option", { name: "Old Card" })).toBeNull();
  });

  /** The point of the whole change: the DB contract is untouched. */
  it("confirms with the bare code string, exactly as before", async () => {
    mockMethodsFetch();
    const onConfirm = vi.fn();
    renderWithQuery(<PaySaleModal sale={sale} onClose={() => {}} onConfirm={onConfirm} />);

    await waitFor(() => expect(screen.getByRole("option", { name: "Maya" })).toBeTruthy());

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "maya" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm payment/i }));

    expect(onConfirm).toHaveBeenCalledWith("maya");
  });

  it("points at the admin page when no method is configured", async () => {
    mockMethodsFetch([]);
    renderWithQuery(<PaySaleModal sale={sale} onClose={() => {}} onConfirm={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText(/no active payment methods/i)).toBeTruthy()
    );
  });
});

describe("payment totals in the report", () => {
  const sale = (paid_using, price) => ({
    id: Math.random(),
    paid_using,
    items: [{ price, qty: 1 }],
  });

  /**
   * The regression this change exists for: the old panel held `{cash: 0,
   * gcash: 0}` and rendered two cards, so a third method's revenue vanished.
   * paymentBreakdown keys off whatever `paid_using` actually holds, so there is
   * no fixed set of methods left to fall outside of.
   */
  it("gives a method added at runtime its own total", () => {
    const breakdown = paymentBreakdown([
      sale("cash", 100),
      sale("gcash", 50),
      sale("maya", 75),
    ]);

    expect(breakdown.maya).toEqual({ count: 1, total: 75 });
    expect(breakdown.cash).toEqual({ count: 1, total: 100 });
    expect(breakdown.gcash).toEqual({ count: 1, total: 50 });
  });

  /** A code with no row at all still has to carry its money somewhere. */
  it("keeps codes with no configured method rather than dropping them", () => {
    const breakdown = paymentBreakdown([
      sale("cash", 100),
      sale("old-card", 30),
      sale("deleted-one", 20),
    ]);

    expect(breakdown["old-card"]).toEqual({ count: 1, total: 30 });
    expect(breakdown["deleted-one"]).toEqual({ count: 1, total: 20 });
  });

  it("labels every method it was given, configured or not", async () => {
    mockMethodsFetch();
    renderWithQuery(
      <PaymentBreakdownChart
        paymentMethodBreakdown={paymentBreakdown([
          sale("cash", 100),
          sale("maya", 75),
          sale("deleted-one", 20),
        ])}
      />
    );

    await waitFor(() => expect(screen.getByText("Maya")).toBeTruthy());
    expect(screen.getByText("Cash")).toBeTruthy();
    // Title-cased from the bare code, so the ₱20 stays attributable.
    expect(screen.getByText("Deleted One")).toBeTruthy();
    expect(screen.getByText("₱20.00")).toBeTruthy();
  });
});
