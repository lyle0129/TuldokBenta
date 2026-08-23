/**
 * Test wrapper for anything that reads through the query cache.
 *
 * Every helper builds a *fresh* QueryClient. Sharing one across tests would let
 * an earlier test's cached data satisfy a later test's query, which would
 * silently hollow out the assertions that check what was requested.
 */
import React from "react";
import { render, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setActiveShopId, setSession } from "../../utils/session";

/**
 * Puts a session and an active shop in place, for tests that mount data hooks.
 *
 * Since ticket 08 every shop-scoped query carries `enabled: Boolean(shopId)`, so
 * a hook mounted with no shop selected issues no request at all. That is the
 * behaviour the app wants and it is poison for a test suite: an assertion like
 * "asks for /inventory exactly once" does not fail loudly against an unscoped
 * hook, it simply waits for a request that is never coming.
 *
 * Both helpers below call this by default for that reason — a shop is now part
 * of the ambient state that "renders through the query cache" presupposes, the
 * same way a QueryClientProvider is. Pass `{ shop: null }` to opt out, which is
 * what a test asserting the no-shop path wants.
 *
 * @param {number} [id] the shop to make active
 */
export const withActiveShop = (id = 1) => {
  setSession({
    accessToken: "test-access",
    refreshToken: "test-refresh",
    user: { id: 1, username: "tester", role: "manager", must_change_password: false },
    shops: [{ id, name: `Shop ${id}`, slug: `shop-${id}` }],
  });
  setActiveShopId(id);
};

/**
 * @param {object} [queryOverrides] default query options to override, e.g.
 *   `{ gcTime: 60_000 }` for a test that unmounts and remounts and therefore
 *   needs the cache to outlive the gap the way the real client does.
 */
export const createTestQueryClient = (queryOverrides = {}) =>
  new QueryClient({
    defaultOptions: {
      // retry would turn one failed-request assertion into three, and window
      // focus events in jsdom would add refetches no test asked for. gcTime 0
      // keeps an unmounted query from lingering into the next assertion.
      queries: {
        retry: false,
        gcTime: 0,
        refetchOnWindowFocus: false,
        ...queryOverrides,
      },
      mutations: { retry: false },
    },
  });

const wrapperFor = (client) => {
  const Wrapper = ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

/**
 * render() with a QueryClientProvider and an active shop.
 *
 * @param {object} [options]
 * @param {import("@tanstack/react-query").QueryClient} [options.client]
 * @param {number|null} [options.shop] the active shop id, or null for none
 * @returns the render result plus the client, for cache assertions
 */
export const renderWithQuery = (
  ui,
  { client = createTestQueryClient(), shop = 1 } = {}
) => {
  if (shop !== null) withActiveShop(shop);
  return { client, ...render(ui, { wrapper: wrapperFor(client) }) };
};

/** renderHook() with a QueryClientProvider and an active shop. */
export const renderHookWithQuery = (
  hook,
  { client = createTestQueryClient(), shop = 1 } = {}
) => {
  if (shop !== null) withActiveShop(shop);
  return { client, ...renderHook(hook, { wrapper: wrapperFor(client) }) };
};
