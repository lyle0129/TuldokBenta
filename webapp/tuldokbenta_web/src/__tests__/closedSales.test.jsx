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
import { todayISODate, shiftDay } from "../utils/dateRange";

const today = todayISODate();
const yesterday = shiftDay(today, -1);

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
    render(<ListClosedSales closedSales={[makeSale(1, "INV-0001")]} revertSale={vi.fn()} />);
    expect(screen.getByText(/₱100\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/\$100\.00/)).not.toBeInTheDocument();
  });

  it("shows the caller's empty message so 'no sales' and 'no matches' differ", () => {
    render(
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
    render(<ListClosedSales closedSales={sales} revertSale={vi.fn()} />);

    expect(screen.getByText(/Showing 1–10 of 12/)).toBeInTheDocument();
    expect(screen.getByText("Invoice #INV-0001")).toBeInTheDocument();
    expect(screen.queryByText("Invoice #INV-0011")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /page 2/i }));
    expect(screen.getByText("Invoice #INV-0011")).toBeInTheDocument();
  });

  it("resets to page 1 when the list changes underneath it", () => {
    const sales = Array.from({ length: 12 }, (_, i) => makeSale(i + 1, `INV-${i + 1}`));
    const { rerender } = render(
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
    render(<ListClosedSales closedSales={[makeSale(7, "INV-0007")]} revertSale={revertSale} />);

    fireEvent.click(screen.getByRole("button", { name: /revert/i }));
    expect(revertSale).toHaveBeenCalledWith(7);
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

  it("asks for today's range on first render", async () => {
    const { default: ClosedSales } = await import("../pages/ClosedSales");
    render(<ClosedSales />);

    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));
    expect(requestedUrls[0]).toContain("/closed-sales?lowdate=");
    // The range is sent in UTC, so assert on the local day the request covers.
    const lowdate = decodeURIComponent(
      new URL(requestedUrls[0], "http://x").searchParams.get("lowdate")
    );
    expect(new Date(`${lowdate}Z`).getDate()).toBe(new Date().getDate());
  });

  it("requests the previous day when the back arrow is pressed", async () => {
    const { default: ClosedSales } = await import("../pages/ClosedSales");
    render(<ClosedSales />);

    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));
    const before = requestedUrls.length;

    fireEvent.click(screen.getByRole("button", { name: /previous day/i }));

    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(before));
    const lowdate = decodeURIComponent(
      new URL(requestedUrls.at(-1), "http://x").searchParams.get("lowdate")
    );
    expect(new Date(`${lowdate}Z`).getDate()).toBe(
      new Date(`${yesterday}T00:00:00`).getDate()
    );
  });
});
