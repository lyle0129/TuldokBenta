/**
 * Feature: reporting on one date rule, with point-in-time settlement
 * Subject: pages/Reporting.jsx, components/reporting/*
 *
 * Two properties are pinned here.
 *
 * Dating: closed sales belong to the day they were *paid*, not the day they
 * were opened. The page used to filter on created_at while the API filtered on
 * paid_at, so a sale opened Monday and paid Tuesday counted as Monday revenue.
 *
 * Settlement: every paid/unpaid judgement is made *as of the range's end*, so a
 * report for a past day says what was true on that day and keeps saying it. The
 * alternative — "unpaid right now" — makes historical reports drift as old
 * debts get settled, which is worse than being wrong because nothing looks
 * broken.
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
const FAR_FUTURE = new Date("2099-01-01");

// ---------------------------------------------------------------------------
// ReportSalesList
// ---------------------------------------------------------------------------
describe("ReportSalesList", () => {
  const makeSale = (id, invoice, price = 50, paid = "2026-08-17T02:00:00Z") => ({
    id,
    invoice_number: invoice,
    paid_using: paid ? "cash" : null,
    created_at: "2026-08-17T01:00:00Z",
    paid_at: paid,
    items: [{ type: "item", item_name: "Ariel", qty: 2, price }],
  });

  it("totals in pesos through the shared formatter", () => {
    renderWithQuery(
      <ReportSalesList title="Closed" sales={[makeSale(1, "INV-0001")]} asOf={FAR_FUTURE} />
    );
    expect(screen.getAllByText(/₱100\.00/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\$100\.00/)).not.toBeInTheDocument();
  });

  it("shows the caller's empty message so 'none' and 'no matches' differ", () => {
    renderWithQuery(
      <ReportSalesList
        title="Closed"
        sales={[]}
        asOf={FAR_FUTURE}
        emptyMessage="Nothing was paid in this range."
      />
    );
    expect(screen.getByText("Nothing was paid in this range.")).toBeInTheDocument();
  });

  it("paginates past ten sales", () => {
    const sales = Array.from({ length: 12 }, (_, i) =>
      makeSale(i + 1, `INV-${String(i + 1).padStart(4, "0")}`)
    );
    renderWithQuery(<ReportSalesList title="Closed" sales={sales} asOf={FAR_FUTURE} />);

    expect(screen.getByText(/Showing 1–10 of 12/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /page 2/i }));
    expect(screen.getByText(/Showing 11–12 of 12/)).toBeInTheDocument();
  });

  it("returns to a valid page when the list shrinks underneath it", () => {
    const sales = Array.from({ length: 12 }, (_, i) => makeSale(i + 1, `INV-${i + 1}`));
    const { rerender } = renderWithQuery(
      <ReportSalesList title="Closed" sales={sales} asOf={FAR_FUTURE} />
    );

    fireEvent.click(screen.getByRole("button", { name: /page 2/i }));
    expect(screen.getByText(/Showing 11–12 of 12/)).toBeInTheDocument();

    rerender(<ReportSalesList title="Closed" sales={sales.slice(0, 3)} asOf={FAR_FUTURE} />);
    expect(screen.getByText("INV-1")).toBeInTheDocument();
  });

  it("expands a sale to show its lines", () => {
    renderWithQuery(
      <ReportSalesList title="Closed" sales={[makeSale(1, "INV-1")]} asOf={FAR_FUTURE} />
    );

    const toggle = screen.getByRole("button", { name: /show lines for INV-1/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: /hide lines for INV-1/i })
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/×2/)).toBeInTheDocument();
  });

  /** The badge is a function of `asOf`, not of whether paid_at exists at all. */
  it("badges the same sale UNPAID before its payment and PAID after", () => {
    const paidLate = makeSale(1, "INV-1", 50, "2026-08-20T02:00:00Z");

    const { rerender } = renderWithQuery(
      <ReportSalesList title="x" sales={[paidLate]} asOf={new Date("2026-08-17T23:59:59.999Z")} />
    );
    expect(screen.getByText("UNPAID")).toBeInTheDocument();
    expect(screen.queryByText("PAID")).not.toBeInTheDocument();

    rerender(
      <ReportSalesList title="x" sales={[paidLate]} asOf={new Date("2026-08-25T23:59:59.999Z")} />
    );
    expect(screen.getByText("PAID")).toBeInTheDocument();
    expect(screen.queryByText("UNPAID")).not.toBeInTheDocument();
  });

  it("narrows the rows when a filter pill is chosen", () => {
    const sales = [
      makeSale(1, "INV-PAID", 50, "2026-08-17T02:00:00Z"),
      makeSale(2, "INV-OWED", 50, null),
    ];
    renderWithQuery(
      <ReportSalesList
        title="Booked"
        sales={sales}
        asOf={FAR_FUTURE}
        filters={[
          { id: "all", label: "All" },
          { id: "paid", label: "Paid", test: (s) => Boolean(s.paid_at) },
          { id: "unpaid", label: "Unpaid", test: (s) => !s.paid_at },
        ]}
        emptyMessage="none"
        noMatchMessage="no matches"
      />
    );

    expect(screen.getByText("INV-PAID")).toBeInTheDocument();
    expect(screen.getByText("INV-OWED")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Unpaid" }));
    expect(screen.queryByText("INV-PAID")).not.toBeInTheDocument();
    expect(screen.getByText("INV-OWED")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Reporting page
// ---------------------------------------------------------------------------
describe("Reporting page", () => {
  let requestedUrls;

  /** Opened yesterday, paid today — the cross-day case the report is about. */
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
        if (href.includes("/closed-sales?")) {
          return { ok: true, json: async () => [paidTodayOpenedYesterday] };
        }
        return { ok: true, json: async () => [] };
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const windowRequests = () =>
    requestedUrls.filter((url) => url.includes("/closed-sales?paidlow="));

  const paramOf = (url, key) =>
    decodeURIComponent(new URL(url, "http://x").searchParams.get(key));

  const renderPage = () => renderWithQuery(<Reporting />);

  /** The tile's headline plus its breakdown, as one searchable subtree. */
  const tile = (label) =>
    screen.getByText(label).closest("div").parentElement.parentElement
      .parentElement;

  /** The value of one breakdown line inside a tile: the <dd> beside its <dt>. */
  const part = (panel, label) =>
    within(panel).getByText(label).parentElement.querySelector("dd").textContent;

  it("asks for one window bounded by payment date below and creation date above", async () => {
    renderPage();
    await waitFor(() => expect(windowRequests().length).toBeGreaterThan(0));

    const url = windowRequests()[0];
    expect(paramOf(url, "paidlow")).toBeTruthy();
    expect(paramOf(url, "createdhigh")).toBeTruthy();
    // The old two-request shape is gone.
    expect(url).not.toContain("datefield");
  });

  it("opens on today's local day", async () => {
    renderPage();
    await waitFor(() => expect(windowRequests().length).toBeGreaterThan(0));

    // The window goes out in UTC, so assert on the local day it covers.
    const paidlow = paramOf(windowRequests()[0], "paidlow");
    expect(new Date(`${paidlow}Z`).getDate()).toBe(new Date().getDate());
  });

  it("counts a sale paid today but opened yesterday as collected, not booked", async () => {
    renderPage();
    await screen.findByText("Collected");

    const collected = tile("Collected");
    expect(within(collected).getByText("1 payments")).toBeInTheDocument();

    // The whole ₱100 was collected, and all of it against a booking made
    // before the range — so the split puts it entirely on the "earlier" line.
    expect(part(collected, /from earlier bookings/)).toContain("₱100.00");
    expect(part(collected, /from this range's bookings/)).toContain("₱0.00");

    // Booked covers only what was created in the range — nothing today.
    const booked = tile("Booked");
    expect(within(booked).getByText("0 opened")).toBeInTheDocument();
  });

  /** Every tile's parts must sum to its headline, or the split is a lie. */
  it("splits Collected into parts that add up to its headline", async () => {
    renderPage();
    await screen.findByText("Collected");

    const collected = tile("Collected");
    // Match only the leading amount: a breakdown line reads "₱100.00 (1)", and
    // stripping non-digits would fold the count into the figure.
    const peso = (text) =>
      Number(text.match(/₱([\d,]+\.\d\d)/)[1].replace(/,/g, ""));

    // The headline is the tile's first peso figure; the breakdown follows it.
    const headline = peso(
      within(collected).getAllByText(/^₱[\d,]+\.\d\d$/)[0].textContent
    );
    const thisRange = peso(part(collected, /from this range's bookings/));
    const earlier = peso(part(collected, /from earlier bookings/));

    expect(thisRange + earlier).toBe(headline);
  });

  /**
   * The carried-over list is the population behind Collected's "earlier
   * bookings" line, so the two must agree. This sale was owed when today
   * began and settled during it.
   */
  it("shows a sale carried in from before the range and paid inside it", async () => {
    renderPage();
    const list = await screen.findByText(/Carried over from before this range/);
    const panel = list.closest("div").parentElement;

    expect(within(panel).getByText("INV-0001")).toBeInTheDocument();
    expect(within(panel).getByText("PAID")).toBeInTheDocument();
  });

  it("re-queries with a new range when a preset is chosen", async () => {
    renderPage();
    await waitFor(() => expect(windowRequests().length).toBeGreaterThan(0));
    const before = windowRequests().length;

    fireEvent.click(screen.getByRole("tab", { name: /last 7 days/i }));

    await waitFor(() => expect(windowRequests().length).toBeGreaterThan(before));
    const paidlow = paramOf(windowRequests().at(-1), "paidlow");
    // Six days back plus today.
    expect(new Date(`${paidlow}Z`).getDate()).toBe(
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
