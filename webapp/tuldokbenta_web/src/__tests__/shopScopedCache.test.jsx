/**
 * Feature: the shop dimension on the cache
 * Subject: hooks/useActiveShop.js (setShop), hooks/*.js (enabled gating)
 *
 * The two properties this ticket exists for, both of which fail silently.
 *
 * "Clear before write" is the one worth reading twice. With the id written
 * first, a query already in flight for the old shop resolves into the NEW
 * shop's cache entry — one shop's rows filed under the other's key. Scoped keys
 * do not save you there, because the key is chosen when the query settles.
 *
 * "No shop, no request" is what stops a query firing with `undefined` in its
 * key and no X-Shop-Id header, taking whatever the backend answers, and caching
 * it under a key no invalidation will ever name again.
 */
import React from "react";
import { waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useInventory } from "../hooks/useInventory";
import { useOpenSales } from "../hooks/useSales";
import { setShop } from "../hooks/useActiveShop";
import { queryKeys, QUERY_CACHE_KEY } from "../queryClient";
import {
  clearSession,
  getActiveShopId,
  setActiveShopId,
  setSession,
} from "../utils/session";
import { renderWithQuery, createTestQueryClient } from "./utils/renderWithQuery.jsx";

beforeEach(() => {
  localStorage.clear();
  clearSession();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSession();
  localStorage.clear();
});

describe("setShop", () => {
  it("clears the cache before writing the new id, never after", () => {
    setActiveShopId(1);
    const order = [];

    // Watching localStorage is what makes the ORDER observable: clearQueryCache
    // removes the persisted cache key, and setActiveShopId writes the shop key.
    const removeItem = localStorage.removeItem.bind(localStorage);
    const setItem = localStorage.setItem.bind(localStorage);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation((key) => {
      if (key === QUERY_CACHE_KEY) order.push("cleared");
      return removeItem(key);
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
      if (key === "tb_active_shop") order.push("wrote-shop");
      return setItem(key, value);
    });

    setShop(2);

    expect(order).toEqual(["cleared", "wrote-shop"]);
    expect(getActiveShopId()).toBe(2);
  });

  it("does nothing when the chosen shop is the one already active", () => {
    setActiveShopId(1);
    const spy = vi.spyOn(Storage.prototype, "removeItem");

    setShop(1);

    // Re-picking the current shop from the dropdown must not cost a full refetch
    // of everything on screen.
    expect(spy).not.toHaveBeenCalledWith(QUERY_CACHE_KEY);
  });
});

describe("shop-scoped queries", () => {
  const mockFetch = () => {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        calls.push({ url: String(url), headers: options?.headers ?? {} });
        return { ok: true, status: 200, json: async () => [] };
      })
    );
    return calls;
  };

  const signIn = () =>
    setSession({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      user: { id: 1, username: "ada", role: "manager", must_change_password: false },
      shops: [{ id: 1, name: "A", slug: "a" }],
    });

  const Reads = () => {
    useInventory();
    useOpenSales();
    return null;
  };

  it("issues no request at all while no shop is selected", async () => {
    signIn();
    const calls = mockFetch();

    renderWithQuery(<Reads />, { shop: null });

    // Deliberately a wait-and-see rather than a waitFor: the assertion is that
    // nothing happens, so it needs a window in which something could have.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(calls).toEqual([]);
  });

  it("sends the active shop's header once one is selected", async () => {
    const calls = mockFetch();

    renderWithQuery(<Reads />, { shop: 3 });

    await waitFor(() => expect(calls.length).toBe(2));
    for (const call of calls) {
      expect(call.headers["X-Shop-Id"]).toBe("3");
    }
  });

  it("files each shop's rows under its own cache entry", async () => {
    mockFetch();
    const client = createTestQueryClient({ gcTime: 60_000 });

    renderWithQuery(<Reads />, { client, shop: 1 });
    await waitFor(() =>
      expect(client.getQueryData(queryKeys.inventory(1))).toBeDefined()
    );

    // The other shop's entry does not exist, so nothing can be served from it —
    // which is the whole point. An unscoped key would have made these the same
    // entry and this assertion unwritable.
    expect(client.getQueryData(queryKeys.inventory(2))).toBeUndefined();
  });
});
