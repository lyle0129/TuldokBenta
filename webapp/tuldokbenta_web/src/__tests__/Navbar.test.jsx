/**
 * Subject: components/shared/Navbar.jsx
 *
 * The navbar used to read the auth flag straight from localStorage during
 * render and duplicate its seven links between a desktop row and a mobile
 * dropdown. Both are gone: the links come from one array, and the session is a
 * subscribable store so signing in reveals the right sections without a reload.
 *
 * What the sections follow is now the signed-in user's *role*, not a boolean —
 * a worker and a manager both have an open session and must not see the same
 * bar. These tests pin that alongside the behaviour that made the rewrite worth
 * doing in the first place.
 */
import React from "react";
import { render, screen, fireEvent, within, act, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Navbar from "../components/shared/Navbar";
import { ROLES } from "../components/shared/navItems";
import { clearSession, setSession } from "../utils/session";

// Logout drops the persisted cache; the real client would touch localStorage
// and React Query internals for no benefit here.
vi.mock("../queryClient", () => ({ clearQueryCache: vi.fn() }));
import { clearQueryCache } from "../queryClient";

// Logout also calls the API. The network is not what these tests are about, and
// one of them needs the call to fail.
vi.mock("../api", () => ({ apiRequest: vi.fn(() => Promise.resolve({})) }));
import { apiRequest } from "../api";

const signIn = (role = ROLES.MANAGER, full_name = "Ada Reyes") =>
  setSession({
    accessToken: "access",
    refreshToken: "refresh",
    user: { id: 1, username: "ada", full_name, role, must_change_password: false },
    shops: [{ id: 1, name: "Spincredible", slug: "spincredible" }],
  });

beforeEach(() => {
  localStorage.clear();
  clearSession();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  clearSession();
  localStorage.clear();
  document.body.style.overflow = "";
  document.documentElement.classList.remove("dark");
});

const renderAt = (path = "/open-sales") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Navbar />
      <Routes>
        {/* "/login" is here because logout navigates there. */}
        {["/login", "/open-sales", "/closed-sales", "/inventory", "/reporting"].map(
          (p) => (
            <Route key={p} path={p} element={<main />} />
          )
        )}
      </Routes>
    </MemoryRouter>
  );

const drawer = () => screen.queryByRole("dialog", { name: "Navigation" });
const openDrawer = () =>
  fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

describe("sections follow the role", () => {
  it("shows no groups at all while signed out", () => {
    renderAt();

    expect(screen.queryByRole("button", { name: /Sales/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Manage/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Reporting" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Logout/ })).toBeNull();
  });

  it("gives a worker Sales and nothing else", () => {
    signIn(ROLES.WORKER);
    renderAt();

    expect(screen.getByRole("button", { name: /Sales/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Manage/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Reporting" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Admin/ })).toBeNull();
  });

  it("gives a manager everything but the console", () => {
    signIn(ROLES.MANAGER);
    renderAt();

    expect(screen.getByRole("button", { name: /Sales/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Manage/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reporting" })).toBeInTheDocument();
    // The console is the one group a manager must not see, and unlike Reporting
    // that is a control: every route under it is refused by the server too.
    expect(screen.queryByRole("button", { name: /Admin/ })).toBeNull();
  });

  it("gives a super admin the console as well", () => {
    signIn(ROLES.SUPER_ADMIN);
    renderAt();

    expect(screen.getByRole("button", { name: /Manage/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reporting" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Admin/ })).toBeInTheDocument();
  });

  it("reveals them the moment a session is established, without a remount", () => {
    renderAt();
    expect(screen.queryByRole("button", { name: /Manage/ })).toBeNull();

    act(() => signIn(ROLES.MANAGER));

    expect(screen.getByRole("button", { name: /Manage/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Logout/ })).toBeInTheDocument();
  });

  it("names the signed-in user, falling back to the username", () => {
    signIn(ROLES.WORKER, "Ada Reyes");
    const { unmount } = renderAt();
    expect(screen.getAllByText("Ada Reyes").length).toBeGreaterThan(0);
    unmount();

    signIn(ROLES.WORKER, null);
    renderAt();
    expect(screen.getAllByText("ada").length).toBeGreaterThan(0);
  });
});

describe("desktop grouping", () => {
  it("marks the group owning the current route as active", () => {
    signIn();
    renderAt("/inventory");

    expect(screen.getByRole("button", { name: /Manage/ }).className).toMatch(
      /bg-blue-50/
    );
    expect(screen.getByRole("button", { name: /Sales/ }).className).not.toMatch(
      /bg-blue-50/
    );
  });

  it("opens a menu listing that group's pages and closes on Escape", () => {
    signIn();
    renderAt();
    const trigger = screen.getByRole("button", { name: /Sales/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "Sales" });
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Open Sales",
      "Offline Sales",
      "Closed Sales",
    ]);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes an open menu when a click lands outside it", () => {
    signIn();
    renderAt();
    fireEvent.click(screen.getByRole("button", { name: /Sales/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("mobile drawer", () => {
  // Signed in throughout: the drawer's contents are the role's groups, and a
  // signed-out visitor never reaches a page that renders the navbar at all.
  beforeEach(() => signIn());

  it("opens from the hamburger and locks the page behind it", () => {
    renderAt();
    expect(drawer()).toBeNull();

    openDrawer();
    expect(drawer()).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("closes on Escape and releases the scroll lock", () => {
    renderAt();
    openDrawer();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(drawer()).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes when a destination is chosen", () => {
    renderAt();
    openDrawer();

    fireEvent.click(within(drawer()).getByRole("link", { name: "Closed Sales" }));
    expect(drawer()).toBeNull();
  });

  it("lists the same groups the bar shows", () => {
    renderAt();
    openDrawer();

    const panel = drawer();
    expect(within(panel).getByText("Sales")).toBeInTheDocument();
    expect(within(panel).getByText("Manage")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Inventory" })).toBeInTheDocument();
  });
});

describe("logout", () => {
  it("tells the server, then clears the session and the persisted cache", async () => {
    signIn();
    renderAt();

    fireEvent.click(screen.getByRole("button", { name: /Logout/ }));

    await waitFor(() => expect(clearQueryCache).toHaveBeenCalled());
    expect(apiRequest).toHaveBeenCalledWith("/auth/logout", { method: "POST" });
    expect(localStorage.getItem("tb_session")).toBeNull();
    // The flag the previous build left behind goes with it.
    expect(localStorage.getItem("authenticated")).toBeNull();
  });

  it("completes even when the logout call fails", async () => {
    apiRequest.mockRejectedValueOnce(new Error("network down"));
    signIn();
    renderAt();

    fireEvent.click(screen.getByRole("button", { name: /Logout/ }));

    await waitFor(() => expect(clearQueryCache).toHaveBeenCalled());
    expect(localStorage.getItem("tb_session")).toBeNull();
    expect(screen.queryByRole("button", { name: /Logout/ })).toBeNull();
  });
});

describe("dark mode", () => {
  it("toggles the class on the document and remembers the choice", () => {
    renderAt();
    const toggle = screen.getByRole("button", { name: "Switch to dark mode" });

    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
  });
});
