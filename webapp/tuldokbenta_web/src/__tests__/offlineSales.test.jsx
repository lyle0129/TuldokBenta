/**
 * Feature: syncing the offline sale queue
 * Subject: pages/OpenSalesOffline.jsx
 *
 * This page is the recovery path for sales taken while the connection was too bad to
 * open them normally, so "Create Open Sale" has to be safe to press. These pin the
 * three ways it wasn't:
 *
 *   - it removed a sale by an index captured before the request, so syncing a second
 *     sale mid-flight wrote back the array the first was still in;
 *   - nothing disabled the button, and a double-click sent the sale twice — now that
 *     a taken invoice number is reallocated rather than refused, that would be two
 *     real sales and the stock deducted twice;
 *   - a reallocated number left the cashier holding a receipt that no longer matches
 *     the sale, with nothing on screen saying so.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import OpenSalesOffline from "../pages/OpenSalesOffline";
import {
  OFFLINE_SALES_KEY,
  OFFLINE_CATALOG_KEY,
  OFFLINE_NEXT_INVOICE_KEY,
  readJSON,
} from "../utils/storage";

const createOpenSale = vi.fn();
vi.mock("../hooks/useSales", () => ({
  useSaleMutations: () => ({ createOpenSale: (...args) => createOpenSale(...args) }),
}));

const printInvoice = vi.fn();
vi.mock("../utils/printInvoice", () => ({
  printInvoice: (...args) => printInvoice(...args),
}));

const queuedSale = (invoice) => ({
  invoice_number: invoice,
  items: [{ type: "item", item_name: "Ariel", price: 50, qty: 1 }],
  customer_name: null,
  date: "2026-01-01T00:00:00.000Z",
});

/** A create that resolves only when the test says so. */
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const ok = (invoice, extra = {}) => ({
  ok: true,
  message: null,
  data: {
    id: 1,
    invoice_number: invoice,
    created_at: "2026-01-02T00:00:00.000Z",
    items: [{ type: "item", item_name: "Ariel", price: 50, qty: 1 }],
    ...extra,
  },
});

const syncButtons = () => screen.getAllByRole("button", { name: /create open sale/i });

const queueInvoices = () =>
  readJSON(OFFLINE_SALES_KEY, []).map((s) => s.invoice_number);

beforeEach(() => {
  localStorage.clear();
  createOpenSale.mockReset();
  printInvoice.mockReset();
  // A synced catalog, so the page renders its normal state rather than the
  // "these are built-in defaults" warning. What's in it doesn't matter here —
  // these tests act on the queue, not the item grid.
  localStorage.setItem(
    OFFLINE_CATALOG_KEY,
    JSON.stringify({
      inventory: [{ id: 1, item_name: "Ariel", price: 50, stock: 10 }],
      services: [],
      syncedAt: "2026-01-01T00:00:00.000Z",
    })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("syncing the queue", () => {
  it("does not resurrect a sale deleted while another was still syncing", async () => {
    localStorage.setItem(
      OFFLINE_SALES_KEY,
      JSON.stringify([queuedSale("INV-0001"), queuedSale("INV-0002")])
    );

    const pending = deferred();
    createOpenSale.mockReturnValue(pending.promise);

    render(<OpenSalesOffline />);
    expect(syncButtons()).toHaveLength(2);

    // INV-0001 goes up. While that request is in the air the cashier deletes
    // INV-0002 — so the queue changes under a handler that already captured it.
    fireEvent.click(syncButtons()[0]);

    fireEvent.click(screen.getAllByRole("button", { name: /^delete$/i })[1]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /yes, delete/i }));
    });
    expect(queueInvoices()).toEqual(["INV-0001"]);

    // Removing INV-0001 has to be measured against the queue as it stands now. It
    // used to be measured against the snapshot, which still held INV-0002 — so
    // finishing the sync wrote the deleted sale back.
    await act(async () => {
      pending.resolve(ok("INV-0001"));
    });

    await waitFor(() => expect(queueInvoices()).toEqual([]));
    expect(screen.queryByText(/INV-0002/)).toBeNull();
  });

  it("sends the sale once when the button is double-clicked", async () => {
    localStorage.setItem(OFFLINE_SALES_KEY, JSON.stringify([queuedSale("INV-0001")]));

    const pending = deferred();
    createOpenSale.mockReturnValue(pending.promise);

    render(<OpenSalesOffline />);
    const button = syncButtons()[0];

    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(createOpenSale).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/creating/i);

    await act(async () => {
      pending.resolve(ok("INV-0001"));
    });
    await waitFor(() => expect(queueInvoices()).toEqual([]));
  });

  it("sends the queued number as a request, and drops the sale on success", async () => {
    localStorage.setItem(OFFLINE_SALES_KEY, JSON.stringify([queuedSale("INV-0007")]));
    createOpenSale.mockResolvedValue(ok("INV-0007"));

    render(<OpenSalesOffline />);
    await act(async () => {
      fireEvent.click(syncButtons()[0]);
    });

    expect(createOpenSale).toHaveBeenCalledWith({
      invoice_number: "INV-0007",
      items: [{ type: "item", item_name: "Ariel", price: 50, qty: 1 }],
      customer_name: null,
    });
    await waitFor(() => expect(queueInvoices()).toEqual([]));
    expect(screen.getByRole("status")).toHaveTextContent(/INV-0007.*created/i);
  });

  it("keeps the sale queued when the server rejects it", async () => {
    localStorage.setItem(OFFLINE_SALES_KEY, JSON.stringify([queuedSale("INV-0001")]));
    createOpenSale.mockResolvedValue({
      ok: false,
      message: "Not enough stock for Ariel",
      data: null,
    });

    render(<OpenSalesOffline />);
    await act(async () => {
      fireEvent.click(syncButtons()[0]);
    });

    expect(queueInvoices()).toEqual(["INV-0001"]);
    expect(screen.getByRole("status")).toHaveTextContent(/still saved offline/i);
  });
});

describe("where the offline counter starts", () => {
  const shownInvoice = () => screen.getByLabelText(/invoice number/i).value;

  it("resumes from what the online page last saw, once the queue has drained", () => {
    // The bug this replaces: the counter was seeded from the queue alone, and the
    // seeding branch only ran when the queue was non-empty. Sync everything, reload,
    // and it silently restarted at INV-0001 — already taken on the server, so the
    // next sync collided by construction.
    localStorage.setItem(OFFLINE_NEXT_INVOICE_KEY, JSON.stringify(88));

    render(<OpenSalesOffline />);
    expect(shownInvoice()).toBe("INV-0088");
  });

  it("takes the queue's own maximum when it is further along than the cache", () => {
    localStorage.setItem(OFFLINE_NEXT_INVOICE_KEY, JSON.stringify(5));
    localStorage.setItem(
      OFFLINE_SALES_KEY,
      JSON.stringify([queuedSale("INV-0010"), queuedSale("INV-0011")])
    );

    render(<OpenSalesOffline />);
    expect(shownInvoice()).toBe("INV-0012");
  });

  it("falls back to INV-0001 on a device that has never been online", () => {
    render(<OpenSalesOffline />);
    expect(shownInvoice()).toBe("INV-0001");
  });
});

describe("a reassigned invoice number", () => {
  const renderReassigned = async () => {
    localStorage.setItem(OFFLINE_SALES_KEY, JSON.stringify([queuedSale("INV-0003")]));
    createOpenSale.mockResolvedValue(
      ok("INV-0087", {
        requested_invoice_number: "INV-0003",
        invoice_reassigned: true,
      })
    );

    render(<OpenSalesOffline />);
    await act(async () => {
      fireEvent.click(syncButtons()[0]);
    });
  };

  it("raises a dialog naming both numbers and asking for a reprint", async () => {
    await renderReassigned();

    // A dialog rather than the status banner: the customer is holding a receipt
    // for a number that now belongs to a different sale, so it has to interrupt.
    const dialog = screen.getByText(/invoice number changed/i).closest("div");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/INV-0003 was already taken/i)).toBeInTheDocument();
    expect(screen.getByText(/opened as INV-0087 instead/i)).toBeInTheDocument();
    expect(screen.getByText(/please reprint the receipt/i)).toBeInTheDocument();
  });

  it("still removes the sale from the queue — it did land on the server", async () => {
    await renderReassigned();
    await waitFor(() => expect(queueInvoices()).toEqual([]));
  });

  it("reprints the server's row, not the queued one, so the new number is on it", async () => {
    await renderReassigned();

    fireEvent.click(screen.getByRole("button", { name: /reprint receipt/i }));

    expect(printInvoice).toHaveBeenCalledTimes(1);
    const printed = printInvoice.mock.calls[0][0];
    expect(printed.invoice_number).toBe("INV-0087");
    expect(printed.created_at).toBe("2026-01-02T00:00:00.000Z");
  });

  it("closes without printing when the cashier dismisses it", async () => {
    await renderReassigned();

    // By text, not by accessible name: the modal's own ✕ is also labelled "Close".
    fireEvent.click(screen.getByText("Close"));

    expect(printInvoice).not.toHaveBeenCalled();
    expect(screen.queryByText(/invoice number changed/i)).toBeNull();
  });
});
