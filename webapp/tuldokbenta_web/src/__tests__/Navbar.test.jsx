/**
 * Subject: components/shared/Navbar.jsx
 *
 * The navbar used to read the auth flag straight from localStorage during
 * render and duplicate its seven links between a desktop row and a mobile
 * dropdown. Both are gone: the links come from one array, and the session is a
 * subscribable store so signing in unhides the admin sections without a reload.
 * These tests pin the behaviour that made the rewrite worth doing.
 */
import React from "react";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Navbar from "../components/shared/Navbar";
import { signIn, signOut } from "../utils/auth";

// Logout drops the persisted cache; the real client would touch localStorage
// and React Query internals for no benefit here.
vi.mock("../queryClient", () => ({ clearQueryCache: vi.fn() }));
import { clearQueryCache } from "../queryClient";

// jsdom throws on a genuine navigation.
const reload = vi.fn();

beforeEach(() => {
  localStorage.clear();
  signOut();
  vi.stubGlobal("location", { ...window.location, reload });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
  document.body.style.overflow = "";
  document.documentElement.classList.remove("dark");
});

const renderAt = (path = "/open-sales") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Navbar />
      <Routes>
        {/* "/" is here because logout navigates there before reloading. */}
        {["/", "/open-sales", "/closed-sales", "/inventory", "/reporting"].map((p) => (
          <Route key={p} path={p} element={<main />} />
        ))}
      </Routes>
    </MemoryRouter>
  );

const drawer = () => screen.queryByRole("dialog", { name: "Navigation" });
const openDrawer = () =>
  fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

describe("admin sections follow the session", () => {
  it("hides Manage and Reporting while signed out, and offers a way in", () => {
    renderAt();

    expect(screen.queryByRole("button", { name: /Manage/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Reporting" })).toBeNull();
    expect(screen.getByRole("link", { name: /Sign In/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Logout/ })).toBeNull();
  });

  it("reveals them the moment the gate accepts, without a remount", () => {
    renderAt();
    expect(screen.queryByRole("button", { name: /Manage/ })).toBeNull();

    // Exactly what ProtectedRoute calls on a correct password.
    act(() => signIn());

    expect(screen.getByRole("button", { name: /Manage/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reporting" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Logout/ })).toBeInTheDocument();
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
    renderAt();
    fireEvent.click(screen.getByRole("button", { name: /Sales/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("mobile drawer", () => {
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
    signIn();
    renderAt();
    openDrawer();

    const panel = drawer();
    expect(within(panel).getByText("Sales")).toBeInTheDocument();
    expect(within(panel).getByText("Manage")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Inventory" })).toBeInTheDocument();
  });
});

describe("logout", () => {
  it("clears the session and the persisted cache", () => {
    signIn();
    renderAt();

    fireEvent.click(screen.getByRole("button", { name: /Logout/ }));

    expect(localStorage.getItem("authenticated")).toBeNull();
    expect(clearQueryCache).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
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
