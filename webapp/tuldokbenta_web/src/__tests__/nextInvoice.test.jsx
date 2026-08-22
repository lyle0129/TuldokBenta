/**
 * Feature: server-allocated invoice numbers
 * Subject: hooks/useSales.js (useNextInvoice), pages/OpenSales.jsx
 *
 * The number is the server's to hand out now. What the page still owes the cashier is
 * a preview of where the numbering stands — visible from inside the cart, which is
 * where they are looking when they take the sale.
 */
import React from "react";
import { screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderWithQuery } from "./utils/renderWithQuery.jsx";

/** Answers each endpoint the page reads, and records the POST bodies. */
const mockServer = ({ nextInvoice = "INV-0087", created } = {}) => {
  const posts = [];
  const urls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      const path = String(url);
      urls.push(path);
      if (options?.method === "POST") {
        posts.push(JSON.parse(options.body));
        return { ok: true, status: 201, json: async () => created };
      }
      if (path.includes("/next-invoice")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ invoice_number: nextInvoice }),
        };
      }
      return { ok: true, status: 200, json: async () => [] };
    })
  );
  return { posts, urls };
};

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("useNextInvoice", () => {
  it("reads /next-invoice instead of the whole closed-sales table", async () => {
    const { urls } = mockServer();
    const { useNextInvoice } = await import("../hooks/useSales.js");

    let seen;
    const Probe = () => {
      seen = useNextInvoice().nextInvoice;
      return null;
    };
    renderWithQuery(<Probe />);

    await waitFor(() => expect(seen).toBe("INV-0087"));
    expect(urls.some((u) => u.includes("/next-invoice"))).toBe(true);
    expect(urls.some((u) => u.includes("/closed-sales"))).toBe(false);
  });
});

describe("the Open Sales cart", () => {
  const renderPage = async (options) => {
    const server = mockServer(options);
    const OpenSales = (await import("../pages/OpenSales.jsx")).default;
    renderWithQuery(<OpenSales />);
    return server;
  };

  it("shows the next invoice number so the cashier knows where numbering stands", async () => {
    await renderPage();

    await waitFor(() =>
      expect(screen.getByText("INV-0087")).toBeInTheDocument()
    );
  });

  it("does not send an invoice number — the server allocates it", async () => {
    const created = {
      id: 1,
      invoice_number: "INV-0087",
      items: [],
      created_at: "2026-01-02T00:00:00.000Z",
    };
    const { posts } = await renderPage({ created });

    // Straight at the mutation: driving the cart through the catalog is
    // openSalesCart.test.jsx's job, and this only cares about the request body.
    const { useSaleMutations } = await import("../hooks/useSales.js");
    const captured = {};
    const Harness = () => {
      Object.assign(captured, useSaleMutations());
      return null;
    };
    renderWithQuery(<Harness />);

    await act(async () => {
      await captured.createOpenSale({
        items: [{ type: "item", item_name: "Ariel", price: 50, qty: 1 }],
        customer_name: null,
      });
    });

    expect(posts).toHaveLength(1);
    expect(posts[0]).not.toHaveProperty("invoice_number");
  });
});
