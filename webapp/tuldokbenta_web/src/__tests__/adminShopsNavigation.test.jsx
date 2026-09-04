/**
 * Feature: admin list navigation (pagination, filters, sort)
 * Subject: pages/AdminShops.jsx
 *
 * The Shops screen used to render every shop it fetched, with a substring
 * search as the only way to narrow it. It now filters by status, sorts, and
 * pages at ten.
 *
 * The case worth pinning down is the interaction between the three: filtering
 * while standing on a later page. Without the clamp in `pageSlice` and the
 * reset effect, narrowing the list leaves the admin on a page that no longer
 * exists, looking at an empty card with a pager that says there is nothing to
 * go back to — a dead end reachable in two clicks.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockHook = vi.fn();
vi.mock("../hooks/useAdminShops", () => ({
  useAdminShops: () => mockHook(),
  shopsById: () => ({}),
}));

import AdminShops from "../pages/AdminShops";

const shop = (i, overrides = {}) => ({
  id: i,
  name: `Shop ${String(i).padStart(2, "0")}`,
  slug: `shop-${i}`,
  is_active: true,
  invoice_prefix: "INV-",
  created_at: `2026-01-${String(i).padStart(2, "0")}T00:00:00.000Z`,
  ...overrides,
});

const renderPage = (shops) => {
  mockHook.mockReturnValue({
    shops,
    isLoading: false,
    error: null,
    mutationError: null,
    isMutating: false,
    createShop: vi.fn(),
    updateShop: vi.fn(),
    setShopActive: vi.fn(),
    saveShopLogo: vi.fn(),
  });
  return render(<AdminShops />);
};

/** The shop names currently rendered as cards, in order. */
const shownNames = () =>
  screen
    .getAllByRole("heading", { level: 3 })
    .map((h) => h.textContent.trim());

beforeEach(() => {
  mockHook.mockReset();
});

describe("paging", () => {
  it("shows only the first ten of a longer list", () => {
    renderPage(Array.from({ length: 25 }, (_, i) => shop(i + 1)));

    expect(shownNames()).toHaveLength(10);
    expect(screen.getByText(/Showing 1–10 of 25/)).toBeInTheDocument();
  });

  it("hides the pager entirely when everything fits on one page", () => {
    renderPage([shop(1), shop(2)]);

    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });

  it("walks to the next page", async () => {
    renderPage(Array.from({ length: 25 }, (_, i) => shop(i + 1)));

    await userEvent.click(screen.getByRole("button", { name: "Page 2" }));

    expect(shownNames()[0]).toBe("Shop 11");
    expect(screen.getByText(/Showing 11–20 of 25/)).toBeInTheDocument();
  });
});

describe("filtering", () => {
  it("narrows to inactive shops only", async () => {
    renderPage([
      shop(1),
      shop(2, { is_active: false }),
      shop(3, { is_active: false }),
    ]);

    await userEvent.click(screen.getByRole("tab", { name: "Inactive" }));

    expect(shownNames()).toEqual(["Shop 02", "Shop 03"]);
  });

  it("leaves the headline totals reading the unfiltered figures", async () => {
    renderPage([shop(1), shop(2, { is_active: false })]);

    await userEvent.click(screen.getByRole("tab", { name: "Active" }));

    // One card on screen, but still "2 shops · 1 active" above it: the totals
    // are the global picture, the filtered count is the pager's job.
    expect(shownNames()).toEqual(["Shop 01"]);
    expect(screen.getByText("2 shops")).toBeInTheDocument();
  });

  it("returns to page 1 when a filter is applied from a later page", async () => {
    // 15 active + 5 inactive. Stand on page 2, then filter to the 5 inactive:
    // page 2 no longer exists.
    const shops = [
      ...Array.from({ length: 15 }, (_, i) => shop(i + 1)),
      ...Array.from({ length: 5 }, (_, i) => shop(i + 16, { is_active: false })),
    ];
    renderPage(shops);

    await userEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(shownNames()[0]).toBe("Shop 11");

    await userEvent.click(screen.getByRole("tab", { name: "Inactive" }));

    // Five results, all on screen, and no empty page.
    expect(shownNames()).toHaveLength(5);
    expect(shownNames()[0]).toBe("Shop 16");
  });

  it("says why the list is empty when a filter excludes everything", async () => {
    renderPage([shop(1), shop(2)]);

    await userEvent.click(screen.getByRole("tab", { name: "Inactive" }));

    expect(screen.getByText("No shops match this filter.")).toBeInTheDocument();
  });
});

describe("sorting", () => {
  it("reverses the order when the direction is toggled", async () => {
    renderPage([shop(1), shop(2), shop(3)]);

    expect(shownNames()).toEqual(["Shop 01", "Shop 02", "Shop 03"]);

    await userEvent.click(
      screen.getByRole("button", { name: /Sort Name descending/ })
    );

    expect(shownNames()).toEqual(["Shop 03", "Shop 02", "Shop 01"]);
  });

  it("sorts by a different field without losing the direction", async () => {
    renderPage([
      shop(1, { slug: "zulu" }),
      shop(2, { slug: "alpha" }),
      shop(3, { slug: "mike" }),
    ]);

    await userEvent.selectOptions(
      screen.getByLabelText("Sort by"),
      "slug"
    );

    expect(shownNames()).toEqual(["Shop 02", "Shop 03", "Shop 01"]);
  });
});
