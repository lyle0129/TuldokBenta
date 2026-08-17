/**
 * Feature: TanStack Query caching
 * Subject: hooks/useInventory.js, hooks/useSales.js, queryClient.js
 *
 * These pin the two properties the whole change exists for: reads are shared
 * rather than repeated per component, and each mutation invalidates exactly
 * what the server actually changed — no more, no less.
 *
 * The "no less" half is the reason the double-refetch in ListSales existed.
 * The "no more" half is taken from the controllers: creating, editing and
 * deleting an open sale move stock in the same transaction, while pay and
 * revert only move the row between tables and leave inventory alone.
 */
import React from "react";
import { act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { useInventory } from "../hooks/useInventory";
import { useServices } from "../hooks/useServices";
import {
  useOpenSales,
  useClosedSales,
  useSaleMutations,
} from "../hooks/useSales";
import {
  renderWithQuery,
  createTestQueryClient,
} from "./utils/renderWithQuery.jsx";

/** Records every request so tests can count them per endpoint. */
const mockFetch = () => {
  const calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      calls.push({ url: String(url), method: options?.method ?? "GET" });
      return { ok: true, status: 200, json: async () => [] };
    })
  );
  return calls;
};

const countGets = (calls, path) =>
  calls.filter((c) => c.method === "GET" && c.url.includes(path)).length;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shared read cache", () => {
  it("fetches inventory once for two components that both ask for it", async () => {
    const calls = mockFetch();

    const Probe = () => {
      const { inventory } = useInventory();
      return <span>{inventory.length}</span>;
    };

    renderWithQuery(
      <>
        <Probe />
        <Probe />
      </>
    );

    await waitFor(() => expect(countGets(calls, "/inventory")).toBe(1));

    // Give any second request a chance to land before declaring victory.
    await act(async () => {
      await Promise.resolve();
    });
    expect(countGets(calls, "/inventory")).toBe(1);
  });

  /**
   * The reads the Open Sales page performs, as one component.
   *
   * Mounting and unmounting this is what navigating away and back looks like to
   * the cache — which is the case the whole change is aimed at.
   */
  const OpenSalesReads = () => {
    useInventory();
    useServices();
    useOpenSales();
    useClosedSales();
    return null;
  };

  it("asks for each of the Open Sales page's four lists exactly once per mount", async () => {
    const calls = mockFetch();
    renderWithQuery(<OpenSalesReads />);

    await waitFor(() => expect(calls.length).toBe(4));
    expect(countGets(calls, "/inventory")).toBe(1);
    expect(countGets(calls, "/services")).toBe(1);
    expect(countGets(calls, "/open-sales")).toBe(1);
    expect(countGets(calls, "/closed-sales")).toBe(1);
  });

  it("asks for nothing on a remount while the cache is still fresh", async () => {
    const calls = mockFetch();
    // A real gcTime, not the suite's default of 0: the point of this test is
    // that the cache survives the unmount, and with gcTime 0 a pass would only
    // mean the remount beat the collector rather than that caching worked.
    const client = createTestQueryClient({ gcTime: 5 * 60 * 1000 });

    const first = renderWithQuery(<OpenSalesReads />, { client });
    await waitFor(() => expect(calls.length).toBe(4));
    first.unmount();
    calls.length = 0;

    // Same client, i.e. the user navigated away and came back. Each hook sets
    // its own staleTime, so the shared cache answers without a request.
    renderWithQuery(<OpenSalesReads />, { client });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(calls).toEqual([]);
  });
});

describe("mutation invalidation", () => {
  /** Mounts the sales + inventory reads and exposes the mutations to the test. */
  const mountHarness = () => {
    const captured = {};
    const Harness = () => {
      useOpenSales();
      useInventory();
      Object.assign(captured, useSaleMutations());
      return null;
    };
    renderWithQuery(<Harness />);
    return captured;
  };

  it("refetches open sales but not inventory after paying, since stock is untouched", async () => {
    const calls = mockFetch();
    const mutations = mountHarness();

    await waitFor(() => {
      expect(countGets(calls, "/open-sales")).toBe(1);
      expect(countGets(calls, "/inventory")).toBe(1);
    });
    calls.length = 0;

    await act(async () => {
      await mutations.paySale(7, "cash");
    });

    await waitFor(() => expect(countGets(calls, "/open-sales")).toBe(1));
    expect(countGets(calls, "/inventory")).toBe(0);
  });

  it("refetches both open sales and inventory after opening a sale, which does move stock", async () => {
    const calls = mockFetch();
    const mutations = mountHarness();

    await waitFor(() => {
      expect(countGets(calls, "/open-sales")).toBe(1);
      expect(countGets(calls, "/inventory")).toBe(1);
    });
    calls.length = 0;

    await act(async () => {
      await mutations.createOpenSale({ invoice_number: "INV-0001", items: [] });
    });

    await waitFor(() => {
      expect(countGets(calls, "/open-sales")).toBe(1);
      expect(countGets(calls, "/inventory")).toBe(1);
    });
  });
});

describe("mutation failures", () => {
  it("reports the server's own message so the cart can show which line was rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ message: "Not enough stock for Ariel" }),
      }))
    );

    const captured = {};
    const Harness = () => {
      Object.assign(captured, useSaleMutations());
      return null;
    };
    renderWithQuery(<Harness />);

    let result;
    await act(async () => {
      result = await captured.createOpenSale({ invoice_number: "INV-0001", items: [] });
    });

    expect(result).toEqual({ ok: false, message: "Not enough stock for Ariel" });
  });
});
