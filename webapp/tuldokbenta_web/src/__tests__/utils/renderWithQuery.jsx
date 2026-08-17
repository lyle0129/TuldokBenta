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

/** render() with a QueryClientProvider. Returns the client for cache assertions. */
export const renderWithQuery = (ui, { client = createTestQueryClient() } = {}) => ({
  client,
  ...render(ui, { wrapper: wrapperFor(client) }),
});

/** renderHook() with a QueryClientProvider. */
export const renderHookWithQuery = (
  hook,
  { client = createTestQueryClient() } = {}
) => ({
  client,
  ...renderHook(hook, { wrapper: wrapperFor(client) }),
});
