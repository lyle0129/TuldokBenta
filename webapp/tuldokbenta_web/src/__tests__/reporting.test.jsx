/**
 * Feature: reporting rebuilt on one date-attribution rule
 * Subject: pages/Reporting.jsx, components/reporting/*
 *
 * The page used to filter closed sales on created_at while the API filtered on
 * paid_at, so a sale opened Monday and paid Tuesday counted as Monday revenue
 * even though no money moved that day. These tests pin what the page now asks
 * the server for, and that the two totals stay distinct.
 */
import React from "react";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ReportSalesList from "../components/reporting/ReportSalesList";
// Imported statically: pulled in lazily inside a test, the recharts dependency
// costs more than the per-test timeout allows.
import Reporting from "../pages/Reporting";
import { renderWithQuery } from "./utils/renderWithQuery.jsx";
import { todayISODate, shiftDay } from "../utils/dateRange";

const today = todayISODate();

// ---------------------------------------------------------------------------
// ReportSalesList
// ---------------------------------------------------------------------------
describe("ReportSalesList", () => {
  const makeSale = (id, invoice, price = 50) => ({
    id,
    invoice_number: invoice,
    paid_using: "cash",
    created_at: "2026-08-17T01:00:00Z",
    paid_at: "2026-08-17T02:00:00Z",
    items: [{ type: "item", item_name: "Ariel", qty: 2, price }],
  });

  it("totals in pesos through the shared formatter", () => {
    renderWithQuery(
      <ReportSalesList title="Closed" sales={[makeSale(1, "INV-0001")]} showPayment />
    );
    expect(screen.getAllByText(/₱100\.00/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\$100\.00/)).not.toBeInTheDocument();
  });

  it("shows the caller's empty message so 'none' and 'no matches' differ", () => {
    renderWithQuery(
      <ReportSalesList
        title="Closed"
        sales={[]}
        emptyMessage="Nothing was paid in this range."
      />
    );
    expect(screen.getByText("Nothing was paid in this range.")).toBeInTheDocument();
  });

  it("paginates past ten sales", () => {
    const sales = Array.from({ length: 12 }, (_, i) =>
      makeSale(i + 1, `INV-${String(i + 1).padStart(4, "0")}`)
    );
    renderWithQuery(<ReportSalesList title="Closed" sales={sales} />);

    expect(screen.getByText(/Showing 1–10 of 12/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /page 2/i }));
    expect(screen.getByText(/Showing 11–12 of 12/)).toBeInTheDocument();
  });

  /**
   * Narrowing the filter used to leave the pager on a page that no longer
   * existed, which rendered as an empty list rather than as no matches.
   */
  it("returns to a valid page when the list shrinks underneath it", () => {
    const sales = Array.from({ length: 12 }, (_, i) => makeSale(i + 1, `INV-${i + 1}`));
    const { rerender } = renderWithQuery(
      <ReportSalesList title="Closed" sales={sales} />
    );

    fireEvent.click(screen.getByRole("button", { name: /page 2/i }));
    expect(screen.getByText(/Showing 11–12 of 12/)).toBeInTheDocument();

    rerender(<ReportSalesList title="Closed" sales={sales.slice(0, 3)} />);
    expect(screen.getByText("INV-1")).toBeInTheDocument();
  });

  it("offers a paid-date sort only where payment info is shown", () => {
    const { rerender } = renderWithQuery(
      <ReportSalesList title="Open" sales={[makeSale(1, "INV-1")]} />
    );
    expect(screen.queryByRole("button", { name: /^paid$/i })).not.toBeInTheDocument();

    rerender(<ReportSalesList title="Closed" sales={[makeSale(1, "INV-1")]} showPayment />);
    expect(screen.getByRole("button", { name: /^paid$/i })).toBeInTheDocument();
  });

  it("expands a sale to show its lines", () => {
    renderWithQuery(<ReportSalesList title="Closed" sales={[makeSale(1, "INV-1")]} />);

    const toggle = screen.getByRole("button", { name: /show lines for INV-1/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: /hide lines for INV-1/i })
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/×2/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Reporting page — what it asks the server for
// ---------------------------------------------------------------------------
describe("Reporting page", () => {
  let requestedUrls;

  /** One paid today but opened yesterday — the case the old page got wrong. */
  const paidTodayOpenedYesterday = {
    id: 1,
    invoice_number: "INV-0001",
    paid_using: "cash",
    created_at: `${shiftDay(today, -1)}T09:00:00`,
    paid_at: `${today}T10:00:00`,
    items: [{ type: "service", service_name: "Wash", qty: 1, price: 100 }],
  };

  beforeEach(() => {
    requestedUrls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        const href = String(url);
        requestedUrls.push(href);

        // Only the paid_at window knows about this sale; the created_at window
        // for today does not, because it was opened yesterday.
        if (href.includes("/closed-sales?") && href.includes("datefield=paid_at")) {
          return { ok: true, json: async () => [paidTodayOpenedYesterday] };
        }
        return { ok: true, json: async () => [] };
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const closedRequests = () =>
    requestedUrls.filter((url) => url.includes("/closed-sales?lowdate="));

  const paramOf = (url, key) =>
    decodeURIComponent(new URL(url, "http://x").searchParams.get(key));

  const renderPage = () => renderWithQuery(<Reporting />);

  it("asks for both readings of the range, by payment date and by creation date", async () => {
    renderPage();

    await waitFor(() => expect(closedRequests().length).toBeGreaterThanOrEqual(2));

    const fields = closedRequests().map((url) => paramOf(url, "datefield"));
    expect(fields).toContain("paid_at");
    expect(fields).toContain("created_at");
  });

  it("opens on today's local day", async () => {
    renderPage();

    await waitFor(() => expect(closedRequests().length).toBeGreaterThan(0));
    // The range goes out in UTC, so assert on the local day it covers.
    const lowdate = paramOf(closedRequests()[0], "lowdate");
    expect(new Date(`${lowdate}Z`).getDate()).toBe(new Date().getDate());
  });

  /** The reported bug, end to end. */
  it("counts a sale paid today but opened yesterday as collected, not booked", async () => {
    renderPage();

    const collected = await screen.findByText("Collected");
    const collectedTile = collected.closest("div").parentElement.parentElement;
    expect(within(collectedTile).getByText("₱100.00")).toBeInTheDocument();
    expect(within(collectedTile).getByText("1 paid")).toBeInTheDocument();

    // Booked covers only what was *created* in the range, so today's booked is
    // empty — the sale was opened yesterday.
    const booked = screen.getByText("Booked");
    const bookedTile = booked.closest("div").parentElement.parentElement;
    expect(within(bookedTile).getByText("0 opened")).toBeInTheDocument();
  });

  it("re-queries with a new range when a preset is chosen", async () => {
    renderPage();
    await waitFor(() => expect(closedRequests().length).toBeGreaterThanOrEqual(2));
    const before = closedRequests().length;

    fireEvent.click(screen.getByRole("tab", { name: /last 7 days/i }));

    await waitFor(() => expect(closedRequests().length).toBeGreaterThan(before));
    const lowdate = paramOf(closedRequests().at(-1), "lowdate");
    // Six days back plus today.
    expect(new Date(`${lowdate}Z`).getDate()).toBe(
      new Date(`${shiftDay(today, -6)}T00:00:00`).getDate()
    );
  });

  it("surfaces a failed load instead of rendering a dashboard of zeroes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ message: "Internal Server Error" }),
      }))
    );

    renderPage();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("Collected")).not.toBeInTheDocument();
  });
});
