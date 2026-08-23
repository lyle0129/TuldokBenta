/**
 * Feature: the shop picker and the active-shop store
 * Subject: hooks/useActiveShop.js, components/shared/ShopPicker.jsx
 *
 * Two things are pinned here, and neither announces itself when broken.
 *
 * The first is that switching CLEARS THE CACHE BEFORE writing the new id. Get
 * that order wrong and queries already in flight for the old shop resolve into
 * the new shop's cache entries — one shop's rows served under the other's key,
 * which is the exact failure the scoped keys exist to prevent, arriving through
 * the one window where the key is chosen before the response lands.
 *
 * The second is that a shop no longer in the user's list is discarded rather
 * than sent. Sending it earns a 403 on every query on the page instead of a
 * picker.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ShopPicker from "../components/shared/ShopPicker";
import { useActiveShop, forgetShopList } from "../hooks/useActiveShop";
import {
  clearSession,
  getActiveShopId,
  setActiveShopId,
  setSession,
} from "../utils/session";
import { setCartDirty } from "../utils/cartDirty";
import { renderHookWithQuery } from "./utils/renderWithQuery.jsx";

const shop = (id, name) => ({ id, name, slug: name.toLowerCase() });

const signIn = (shops, role = "manager") =>
  setSession({
    accessToken: "access-1",
    refreshToken: "refresh-1",
    user: { id: 1, username: "ada", role, must_change_password: false },
    shops,
  });

beforeEach(() => {
  localStorage.clear();
  clearSession();
  setCartDirty(false);
  // The super admin's shop list is cached for the life of the page load, which
  // in a test file means for the life of the file. Without this reset the first
  // suite's response would answer every later suite's fetch.
  forgetShopList();
  vi.clearAllMocks();
  // useAvailableShops fetches /auth/me for a super admin; every other test here
  // is a manager and issues no request at all.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSession();
  localStorage.clear();
});

describe("ShopPicker", () => {
  it("renders a control when there is a choice to make", () => {
    signIn([shop(1, "Spincredible"), shop(2, "Scratch")]);
    setActiveShopId(1);

    render(<ShopPicker />);

    const select = screen.getByRole("combobox", { name: /active shop/i });
    expect(select).toHaveValue("1");
    expect(screen.getByRole("option", { name: "Scratch" })).toBeInTheDocument();
  });

  /**
   * Requirement 5.3. A dropdown holding one option invites a click that does
   * nothing, and most staff have exactly one shop — so this is what the majority
   * of users actually see.
   */
  it("renders the name as plain text when there is only one shop", () => {
    signIn([shop(1, "Spincredible")]);
    setActiveShopId(1);

    render(<ShopPicker />);

    expect(screen.getByText("Spincredible")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("switches shops when a different one is chosen", () => {
    signIn([shop(1, "Spincredible"), shop(2, "Scratch")]);
    setActiveShopId(1);

    render(<ShopPicker />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });

    expect(getActiveShopId()).toBe(2);
  });

  describe("with a sale in progress", () => {
    it("confirms first, and leaves the shop alone when cancelled", () => {
      signIn([shop(1, "Spincredible"), shop(2, "Scratch")]);
      setActiveShopId(1);
      setCartDirty(true);
      vi.stubGlobal("confirm", vi.fn(() => false));

      render(<ShopPicker />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });

      expect(window.confirm).toHaveBeenCalled();
      // Requirement 5.4: cancelling must leave BOTH the shop and the cart. The
      // cart survives because nothing was cleared, and the select goes back to
      // shop 1 because its value is driven by the store, not by the event.
      expect(getActiveShopId()).toBe(1);
    });

    it("switches when the confirmation is accepted", () => {
      signIn([shop(1, "Spincredible"), shop(2, "Scratch")]);
      setActiveShopId(1);
      setCartDirty(true);
      vi.stubGlobal("confirm", vi.fn(() => true));

      render(<ShopPicker />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });

      expect(getActiveShopId()).toBe(2);
    });

    it("does not ask when the cart is empty", () => {
      signIn([shop(1, "Spincredible"), shop(2, "Scratch")]);
      setActiveShopId(1);
      vi.stubGlobal("confirm", vi.fn(() => true));

      render(<ShopPicker />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });

      expect(window.confirm).not.toHaveBeenCalled();
      expect(getActiveShopId()).toBe(2);
    });
  });
});

describe("useActiveShop", () => {
  it("discards a stored shop that is no longer in the list", () => {
    // The revoked-assignment case. Shop 7 was fine last session.
    signIn([shop(1, "Spincredible"), shop(2, "Scratch")]);
    setActiveShopId(7);

    const { result } = renderHookWithQuery(() => useActiveShop(), { shop: null });

    expect(result.current.shopId).toBeNull();
    expect(result.current.shop).toBeNull();
  });

  /** Requirement 1.2: one shop is not a choice, so it is never presented as one. */
  it("auto-selects and persists the only shop, without prompting", async () => {
    signIn([shop(3, "Spincredible")]);

    const { result } = renderHookWithQuery(() => useActiveShop(), { shop: null });

    // Resolved on the FIRST render, not after an effect — RequireRole reads this
    // synchronously, and a null here would bounce a single-shop worker through
    // the picker before any effect could correct it.
    expect(result.current.shopId).toBe(3);
    await waitFor(() => expect(getActiveShopId()).toBe(3));
  });

  it("restores a stored shop that is still assigned", () => {
    signIn([shop(1, "Spincredible"), shop(2, "Scratch")]);
    setActiveShopId(2);

    const { result } = renderHookWithQuery(() => useActiveShop(), { shop: null });

    expect(result.current.shopId).toBe(2);
    expect(result.current.shop.name).toBe("Scratch");
  });

  it("leaves a multi-shop user with nothing selected until they choose", () => {
    signIn([shop(1, "Spincredible"), shop(2, "Scratch")]);

    const { result } = renderHookWithQuery(() => useActiveShop(), { shop: null });

    expect(result.current.shopId).toBeNull();
    expect(result.current.shops).toHaveLength(2);
  });

  it("reports no shops for an account nobody has assigned yet", () => {
    // A real state the API returns deliberately, not an error.
    signIn([]);

    const { result } = renderHookWithQuery(() => useActiveShop(), { shop: null });

    expect(result.current.shops).toEqual([]);
    expect(result.current.shopId).toBeNull();
  });

  describe("for a super admin", () => {
    it("refetches the list so a shop created after sign-in is switchable", async () => {
      // Requirement 2.2. Without the refetch, a super admin who creates a shop
      // in the console cannot switch into it without signing out again.
      signIn([shop(1, "Spincredible")], "super_admin");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            user: { id: 1, username: "ada", role: "super_admin" },
            shops: [shop(1, "Spincredible"), shop(9, "Brand New")],
          }),
        }))
      );

      const { result } = renderHookWithQuery(() => useActiveShop(), { shop: null });

      await waitFor(() => expect(result.current.shops).toHaveLength(2));
      expect(result.current.shops.map((s) => s.id)).toContain(9);
    });

    it("falls back to the session's shops when the refetch fails", async () => {
      signIn([shop(1, "Spincredible"), shop(2, "Scratch")], "super_admin");
      vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));

      const { result } = renderHookWithQuery(() => useActiveShop(), { shop: null });

      // The picker keeps working on a list that is stale by at most whatever was
      // created since sign-in, rather than emptying out.
      await waitFor(() => expect(result.current.shops).toHaveLength(2));
    });
  });

  it("does not fetch a shop list for any other role", () => {
    signIn([shop(1, "Spincredible"), shop(2, "Scratch")]);

    renderHookWithQuery(() => useActiveShop(), { shop: null });

    // The login response already carries exactly the right list for a manager.
    expect(window.fetch).not.toHaveBeenCalled();
  });
});
