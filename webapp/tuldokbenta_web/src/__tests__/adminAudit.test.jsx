/**
 * Feature: the audit viewer
 * Subject: pages/AdminAudit.jsx
 *
 * These are here because the unit tests around this screen were all about pure
 * functions — the filter builder and the change summariser — and the screen
 * shipped with a bug none of them could see. The page reported each fetch's row
 * count upward so the parent could decide the empty case, but a page reports
 * zero while it is still loading, so the parent switched to "No activity in this
 * range." and unmounted the very component that was mid-fetch. The count then
 * stayed at zero forever and a log with rows in it rendered as empty.
 *
 * Every assertion below is about a state this screen can be in, because that is
 * the class of bug: nothing threw, nothing failed, and the one thing the screen
 * exists to show was silently absent.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import { renderWithQuery } from "./utils/renderWithQuery";

const apiRequest = vi.fn();
vi.mock("../api", () => ({
  apiRequest: (...args) => apiRequest(...args),
  ApiError: class ApiError extends Error {},
}));

const SHOPS = [{ id: 1, name: "SPINCREDIBLE", slug: "spincredible", is_active: true }];
const USERS = [
  { id: 4, username: "scratch_sa", full_name: "Ada Reyes", role: "super_admin", shop_ids: [], is_active: true },
];

const event = (id) => ({
  id: String(id),
  occurred_at: "2026-08-23T23:50:25.331Z",
  actor_user_id: 4,
  actor_username: "scratch_sa",
  actor_role: "super_admin",
  shop_id: 1,
  action: "sale.date_corrected",
  entity_type: "closed_sale",
  entity_id: 7014,
  entity_label: `INV-${id}`,
  changes: { before: { created_at: "2026-08-01 10:00:00.000" }, after: { created_at: "2026-07-01 10:00:00.000" } },
  ip_address: "::1",
});

/** Stubs the three requests the page makes, with the audit reply under test. */
const stub = (auditReply) => {
  apiRequest.mockImplementation((path) => {
    if (path.startsWith("/admin/shops")) return Promise.resolve(SHOPS);
    if (path.startsWith("/admin/users")) return Promise.resolve(USERS);
    if (path.startsWith("/admin/audit")) return auditReply(path);
    throw new Error(`unexpected request: ${path}`);
  });
};

const renderPage = async () => {
  const { default: AdminAudit } = await import("../pages/AdminAudit");
  return renderWithQuery(<AdminAudit />);
};

const settled = () =>
  waitFor(() => expect(screen.queryByText(/Loading events/)).toBeNull());

beforeEach(() => {
  apiRequest.mockReset();
});

describe("when the range has events", () => {
  it("renders them rather than the empty message", async () => {
    stub(() => Promise.resolve({ events: [event(1), event(2)], next_cursor: null, actions: ["sale.date_corrected"] }));
    await renderPage();
    await settled();

    expect(screen.queryByText("No activity in this range.")).toBeNull();
    expect(screen.getByText("INV-1")).toBeInTheDocument();
    expect(screen.getByText("INV-2")).toBeInTheDocument();
    expect(screen.getByText(/2 events loaded/)).toBeInTheDocument();
  });

  it("populates the action filter from the range's own actions", async () => {
    stub(() => Promise.resolve({ events: [event(1)], next_cursor: null, actions: ["sale.pay", "user.create"] }));
    await renderPage();
    await settled();

    const select = screen.getByLabelText("Action");
    // Labelled from the action string, never from a constant copy of the
    // backend's vocabulary.
    expect(within(select).getByText("Sale · Pay")).toBeInTheDocument();
    expect(within(select).getByText("User · Create")).toBeInTheDocument();
  });

  it("renders the changes readably rather than as raw JSON", async () => {
    stub(() => Promise.resolve({ events: [event(1)], next_cursor: null, actions: [] }));
    await renderPage();
    await settled();

    expect(screen.getByText("Created at")).toBeInTheDocument();
    expect(screen.getByText("2026-08-01 10:00:00.000")).toBeInTheDocument();
  });
});

describe("when the range is genuinely empty", () => {
  it("says so plainly", async () => {
    stub(() => Promise.resolve({ events: [], next_cursor: null, actions: [] }));
    await renderPage();

    await waitFor(() =>
      expect(screen.getByText("No activity in this range.")).toBeInTheDocument()
    );
    expect(screen.getByText(/0 events loaded/)).toBeInTheDocument();
  });
});

describe("when the request fails", () => {
  it("shows the error instead of claiming there was no activity", async () => {
    // The worst answer this screen can give is a failed read rendered as a clean
    // range: the two are indistinguishable to the reader, and one of them is a
    // lie about whether anything happened.
    stub(() => Promise.reject(new Error("Could not reach the server.")));
    await renderPage();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Could not reach the server.")
    );
    expect(screen.queryByText("No activity in this range.")).toBeNull();
  });
});

describe("paging", () => {
  it("appends the next page without re-requesting the first", async () => {
    stub((path) =>
      Promise.resolve(
        path.includes("cursor=")
          ? { events: [event(3)], next_cursor: null, actions: [] }
          : { events: [event(1), event(2)], next_cursor: "2026-08-23 23:50:25.331|140", actions: [] }
      )
    );
    await renderPage();
    await settled();

    expect(screen.getByText(/2 events loaded/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => expect(screen.getByText("INV-3")).toBeInTheDocument());

    // The earlier page is still on screen — "Load more" appends, it does not
    // replace — and its rows were not fetched a second time.
    expect(screen.getByText("INV-1")).toBeInTheDocument();
    expect(screen.getByText(/3 events loaded/)).toBeInTheDocument();

    const firstPageCalls = apiRequest.mock.calls.filter(
      ([p]) => p.startsWith("/admin/audit") && !p.includes("cursor=")
    );
    expect(firstPageCalls).toHaveLength(1);
  });

  it("offers no Load more when the walk is over", async () => {
    stub(() => Promise.resolve({ events: [event(1)], next_cursor: null, actions: [] }));
    await renderPage();
    await settled();

    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
});

describe("the request it makes", () => {
  it("asks for a bounded range and never more than the cap", async () => {
    stub(() => Promise.resolve({ events: [], next_cursor: null, actions: [] }));
    await renderPage();
    await settled();

    const [path] = apiRequest.mock.calls.find(([p]) => p.startsWith("/admin/audit"));
    const params = new URLSearchParams(path.split("?")[1]);

    expect(params.get("from")).toBeTruthy();
    expect(params.get("to")).toBeTruthy();
    expect(Number(params.get("limit"))).toBeLessThanOrEqual(100);
  });
});
