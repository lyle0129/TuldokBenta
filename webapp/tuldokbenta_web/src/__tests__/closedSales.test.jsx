/**
 * Feature: open/closed sales UX rework
 * Subject: pages/ClosedSales.jsx, components/closed-sales/DayPicker.jsx
 *
 * The page used to be hardwired to today. These tests pin the two properties
 * that mattered to the user: it still opens on today, and other days are now
 * reachable.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import DayPicker from "../components/closed-sales/DayPicker";
import ListClosedSales from "../components/closed-sales/ListClosedSales";
import EditClosedSaleModal from "../components/sales-modals/EditClosedSaleModal";
import { todayISODate, shiftDay } from "../utils/dateRange";
import { renderWithQuery } from "./utils/renderWithQuery.jsx";

const today = todayISODate();
const yesterday = shiftDay(today, -1);

const METHODS = [
  { id: 1, code: "cash", label: "Cash", is_active: true, sort_order: 1 },
  { id: 2, code: "gcash", label: "GCash", is_active: true, sort_order: 2 },
  { id: 3, code: "old-card", label: "Old Card", is_active: false, sort_order: 3 },
];

/** Serves the method list to anything that reads it through the cache. */
const mockMethodsFetch = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => METHODS }))
  );

// ---------------------------------------------------------------------------
// DayPicker
// ---------------------------------------------------------------------------
describe("DayPicker", () => {
  it("shows the selected day", () => {
    render(<DayPicker value="2026-08-17" onChange={vi.fn()} />);
    expect(screen.getByText(/Aug 17, 2026/)).toBeInTheDocument();
  });

  it("steps back a day when the previous arrow is pressed", () => {
    const onChange = vi.fn();
    render(<DayPicker value="2026-08-17" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /previous day/i }));
    expect(onChange).toHaveBeenCalledWith("2026-08-16");
  });

  it("steps forward a day when the next arrow is pressed", () => {
    const onChange = vi.fn();
    render(<DayPicker value={yesterday} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /next day/i }));
    expect(onChange).toHaveBeenCalledWith(today);
  });

  it("will not walk past today", () => {
    render(<DayPicker value={today} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /next day/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /today/i })).toBeDisabled();
  });

  it("jumps back to today from an older day", () => {
    const onChange = vi.fn();
    render(<DayPicker value="2026-01-01" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /^today$/i }));
    expect(onChange).toHaveBeenCalledWith(today);
  });

  it("accepts a date typed into the native picker", () => {
    const onChange = vi.fn();
    render(<DayPicker value={today} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/pick a date/i), {
      target: { value: "2026-03-04" },
    });
    expect(onChange).toHaveBeenCalledWith("2026-03-04");
  });
});

// ---------------------------------------------------------------------------
// ListClosedSales
// ---------------------------------------------------------------------------
// Rows resolve their payment method's label through the shared cache, so these
// need a QueryClient even though nothing here asserts on the label.
describe("ListClosedSales", () => {
  const makeSale = (id, invoice) => ({
    id,
    invoice_number: invoice,
    paid_using: "cash",
    created_at: "2026-08-17T01:00:00Z",
    paid_at: "2026-08-17T02:00:00Z",
    items: [{ type: "item", item_name: "Ariel", qty: 2, price: 50 }],
  });

  it("renders totals in pesos, not dollars", () => {
    renderWithQuery(<ListClosedSales closedSales={[makeSale(1, "INV-0001")]} revertSale={vi.fn()} />);
    expect(screen.getByText(/₱100\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/\$100\.00/)).not.toBeInTheDocument();
  });

  it("shows the caller's empty message so 'no sales' and 'no matches' differ", () => {
    renderWithQuery(
      <ListClosedSales
        closedSales={[]}
        revertSale={vi.fn()}
        emptyMessage="No closed sales on this day."
      />
    );
    expect(screen.getByText("No closed sales on this day.")).toBeInTheDocument();
  });

  it("paginates past ten sales", () => {
    const sales = Array.from({ length: 12 }, (_, i) =>
      makeSale(i + 1, `INV-${String(i + 1).padStart(4, "0")}`)
    );
    renderWithQuery(<ListClosedSales closedSales={sales} revertSale={vi.fn()} />);

    expect(screen.getByText(/Showing 1–10 of 12/)).toBeInTheDocument();
    expect(screen.getByText("Invoice #INV-0001")).toBeInTheDocument();
    expect(screen.queryByText("Invoice #INV-0011")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /page 2/i }));
    expect(screen.getByText("Invoice #INV-0011")).toBeInTheDocument();
  });

  it("resets to page 1 when the list changes underneath it", () => {
    const sales = Array.from({ length: 12 }, (_, i) => makeSale(i + 1, `INV-${i + 1}`));
    const { rerender } = renderWithQuery(
      <ListClosedSales closedSales={sales} revertSale={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: /page 2/i }));
    expect(screen.getByText("Invoice #INV-11")).toBeInTheDocument();

    // Searching narrows the list; page 2 no longer exists.
    rerender(<ListClosedSales closedSales={sales.slice(0, 3)} revertSale={vi.fn()} />);
    expect(screen.getByText("Invoice #INV-1")).toBeInTheDocument();
  });

  it("reverts the sale it was asked to revert", () => {
    const revertSale = vi.fn();
    renderWithQuery(<ListClosedSales closedSales={[makeSale(7, "INV-0007")]} revertSale={revertSale} />);

    fireEvent.click(screen.getByRole("button", { name: /revert/i }));
    expect(revertSale).toHaveBeenCalledWith(7);
  });

  it("offers Edit details only when a save handler was supplied", () => {
    const { rerender } = renderWithQuery(
      <ListClosedSales closedSales={[makeSale(1, "INV-0001")]} revertSale={vi.fn()} />
    );
    expect(
      screen.queryByRole("button", { name: /edit details/i })
    ).not.toBeInTheDocument();

    rerender(
      <ListClosedSales
        closedSales={[makeSale(1, "INV-0001")]}
        revertSale={vi.fn()}
        updateClosedSale={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /edit details/i })
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// EditClosedSaleModal
//
// The only two edits a paid sale allows, because they're the only two that move
// no stock. Changing the method used to mean Revert then re-Pay, which stamps a
// new paid_at and shifts the sale to today in every report keyed off it.
// ---------------------------------------------------------------------------
describe("EditClosedSaleModal", () => {
  const paidSale = (overrides = {}) => ({
    id: 5,
    invoice_number: "INV-0005",
    customer_name: "Maria Santos",
    paid_using: "cash",
    paid_at: "2026-08-17T02:00:00Z",
    items: [{ type: "item", item_name: "Ariel", qty: 1, price: 50 }],
    ...overrides,
  });

  const ok = () => vi.fn(async () => ({ ok: true, message: null }));

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seeds both fields from the sale", async () => {
    mockMethodsFetch();
    renderWithQuery(
      <EditClosedSaleModal sale={paidSale()} onClose={vi.fn()} onSave={ok()} />
    );

    expect(screen.getByLabelText(/customer name/i)).toHaveValue("Maria Santos");
    await waitFor(() =>
      expect(screen.getByLabelText(/payment method/i)).toHaveValue("cash")
    );
  });

  it("sends only the method when only the method changed", async () => {
    mockMethodsFetch();
    const onSave = ok();
    renderWithQuery(
      <EditClosedSaleModal sale={paidSale()} onClose={vi.fn()} onSave={onSave} />
    );

    // Wait for the real options, not just the value — until the fetch lands the
    // select holds a single placeholder option and a change to "gcash" would
    // silently land on nothing.
    await waitFor(() => expect(screen.getByRole("option", { name: "GCash" })));
    fireEvent.change(screen.getByLabelText(/payment method/i), {
      target: { value: "gcash" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    // An absent key reads as "leave it alone" server-side, so renaming and
    // re-tendering stay independent.
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ paid_using: "gcash" }));
  });

  it("sends only the name when only the name changed", async () => {
    mockMethodsFetch();
    const onSave = ok();
    renderWithQuery(
      <EditClosedSaleModal sale={paidSale()} onClose={vi.fn()} onSave={onSave} />
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/payment method/i)).toHaveValue("cash")
    );
    fireEvent.change(screen.getByLabelText(/customer name/i), {
      target: { value: "Juan" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ customer_name: "Juan" })
    );
  });

  it("saves nothing when neither field was touched", async () => {
    mockMethodsFetch();
    const onSave = ok();
    const onClose = vi.fn();
    renderWithQuery(
      <EditClosedSaleModal sale={paidSale()} onClose={onClose} onSave={onSave} />
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/payment method/i)).toHaveValue("cash")
    );
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  // Without the retired option the select would fall back to whatever sits
  // first, so opening the dialog to fix a typo would rewrite the tender.
  it("keeps a method that is no longer offered selectable", async () => {
    mockMethodsFetch();
    const onSave = ok();
    renderWithQuery(
      <EditClosedSaleModal
        sale={paidSale({ paid_using: "old-card" })}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /old card \(no longer offered\)/i })
      ).toBeInTheDocument()
    );
    expect(screen.getByLabelText(/payment method/i)).toHaveValue("old-card");

    // Renaming such a sale must not drag it onto a current method.
    fireEvent.change(screen.getByLabelText(/customer name/i), {
      target: { value: "Juan" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ customer_name: "Juan" })
    );
  });

  it("clears the name when the box is emptied", async () => {
    mockMethodsFetch();
    const onSave = ok();
    renderWithQuery(
      <EditClosedSaleModal sale={paidSale()} onClose={vi.fn()} onSave={onSave} />
    );

    fireEvent.change(screen.getByLabelText(/customer name/i), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ customer_name: "" }));
  });

  it("reports a rejected save instead of closing", async () => {
    mockMethodsFetch();
    const onClose = vi.fn();
    const onSave = vi.fn(async () => ({
      ok: false,
      message: "That payment method is no longer available",
    }));
    renderWithQuery(
      <EditClosedSaleModal sale={paidSale()} onClose={onClose} onSave={onSave} />
    );

    fireEvent.change(screen.getByLabelText(/customer name/i), {
      target: { value: "Juan" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/no longer available/i)
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("reseeds when a different sale is opened", async () => {
    mockMethodsFetch();
    const { rerender } = renderWithQuery(
      <EditClosedSaleModal sale={paidSale()} onClose={vi.fn()} onSave={ok()} />
    );

    fireEvent.change(screen.getByLabelText(/customer name/i), {
      target: { value: "Edited" },
    });

    rerender(
      <EditClosedSaleModal
        sale={paidSale({ id: 6, invoice_number: "INV-0006", customer_name: null })}
        onClose={vi.fn()}
        onSave={ok()}
      />
    );

    expect(screen.getByLabelText(/customer name/i)).toHaveValue("");
  });

  it("returns null without a sale", () => {
    const { container } = renderWithQuery(
      <EditClosedSaleModal sale={null} onClose={vi.fn()} onSave={ok()} />
    );
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ClosedSales page — the day it asks the server for
// ---------------------------------------------------------------------------
describe("ClosedSales page", () => {
  let requestedUrls;

  beforeEach(() => {
    requestedUrls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        requestedUrls.push(url);
        return { ok: true, json: async () => [] };
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The page fetches more than closed sales now — the list resolves payment
  // method labels too — so assert on the day-range requests specifically.
  const dayRequests = () =>
    requestedUrls.filter((url) => String(url).includes("/closed-sales?lowdate="));

  const lowdateOf = (url) =>
    decodeURIComponent(new URL(url, "http://x").searchParams.get("lowdate"));

  it("asks for today's range on first render", async () => {
    const { default: ClosedSales } = await import("../pages/ClosedSales");
    renderWithQuery(<ClosedSales />);

    await waitFor(() => expect(dayRequests().length).toBeGreaterThan(0));
    // The range is sent in UTC, so assert on the local day the request covers.
    const lowdate = lowdateOf(dayRequests()[0]);
    expect(new Date(`${lowdate}Z`).getDate()).toBe(new Date().getDate());
  });

  it("requests the previous day when the back arrow is pressed", async () => {
    const { default: ClosedSales } = await import("../pages/ClosedSales");
    renderWithQuery(<ClosedSales />);

    await waitFor(() => expect(dayRequests().length).toBeGreaterThan(0));
    const before = dayRequests().length;

    fireEvent.click(screen.getByRole("button", { name: /previous day/i }));

    await waitFor(() => expect(dayRequests().length).toBeGreaterThan(before));
    const lowdate = lowdateOf(dayRequests().at(-1));
    expect(new Date(`${lowdate}Z`).getDate()).toBe(
      new Date(`${yesterday}T00:00:00`).getDate()
    );
  });
});
