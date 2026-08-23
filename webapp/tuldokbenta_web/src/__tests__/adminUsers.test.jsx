/**
 * Feature: the super-admin users screen
 * Subject: components/admin/UsersList.jsx
 *
 * Requirement 3.7 asks for the permanent delete to be offered only for an
 * account with no recorded activity, and for the reason to be shown when it is
 * not. The list decides that from `last_login_at`: signing in is what writes an
 * account's first audit row, and adminUsersController refuses the delete for any
 * account that has audit rows.
 *
 * Worth a test because the failure is silent in both directions. A Delete left
 * enabled for an account that has acted looks fine until it is pressed and
 * answered with a 409; one disabled for a fresh account leaves no way to undo a
 * typo'd username, and the reason shown beside it would be a lie.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import UsersList from "../components/admin/UsersList";

const SHOPS = { 1: { id: 1, name: "Spincredible" } };

const user = (overrides) => ({
  id: 1,
  username: "ada",
  full_name: "Ada Reyes",
  role: "worker",
  is_active: true,
  must_change_password: false,
  last_login_at: null,
  shop_ids: [1],
  ...overrides,
});

const renderList = (users, currentUserId = 99) =>
  render(
    <UsersList
      users={users}
      shopsById={SHOPS}
      currentUserId={currentUserId}
      onEdit={vi.fn()}
      onAssignShops={vi.fn()}
      onResetPassword={vi.fn()}
      onToggleActive={vi.fn()}
      onDelete={vi.fn()}
    />
  );

/** The one card on screen, so a query cannot pick up a button from another row. */
const card = (username) => screen.getByText(username).closest("div.border");

describe("the permanent delete", () => {
  it("is offered for an account that has never signed in", () => {
    renderList([user()]);

    expect(screen.getByRole("button", { name: /Delete/ })).toBeEnabled();
    expect(screen.queryByText(/has signed in/)).toBeNull();
  });

  it("is disabled with the reason for an account that has signed in", () => {
    renderList([user({ last_login_at: "2026-08-20T09:14:00.000Z" })]);

    expect(screen.getByRole("button", { name: /Delete/ })).toBeDisabled();
    // The reason is on the card, not only in a title attribute — a disabled
    // button with no explanation is the thing Requirement 3.7 rules out.
    expect(screen.getByText(/has signed in/)).toBeInTheDocument();
    expect(screen.getByText(/Deactivate it instead/)).toBeInTheDocument();
  });

  it("is disabled for the signed-in admin's own row", () => {
    renderList([user({ id: 7, username: "boss", role: "super_admin" })], 7);

    expect(screen.getByRole("button", { name: /Delete/ })).toBeDisabled();
  });
});

describe("deactivation", () => {
  it("is the removal action offered for an account that has acted", () => {
    renderList([user({ last_login_at: "2026-08-20T09:14:00.000Z" })]);

    expect(screen.getByRole("button", { name: "Deactivate" })).toBeEnabled();
  });

  it("is refused on your own row", () => {
    // The server answers 409 for this; the button says so first rather than
    // spending a round trip to be told.
    renderList([user({ id: 7, username: "boss", role: "super_admin" })], 7);

    expect(screen.getByRole("button", { name: "Deactivate" })).toBeDisabled();
  });

  it("becomes Reactivate once the account is inactive", () => {
    renderList([user({ is_active: false })]);

    expect(screen.getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).toBeNull();
  });
});

describe("what a row shows", () => {
  it("names the shops a person is assigned to", () => {
    renderList([user()]);
    expect(within(card("Ada Reyes")).getByText("Spincredible")).toBeInTheDocument();
  });

  it("says a super admin reaches every shop, whatever is assigned", () => {
    renderList([user({ role: "super_admin", shop_ids: [] })]);
    expect(screen.getByText("Every active shop")).toBeInTheDocument();
  });

  it("never renders anything password-shaped", () => {
    // toPublicUser means a hash never arrives; not reaching for one here is the
    // half that stays true if that ever changes.
    const { container } = renderList([
      user({ ...user(), password_hash: "$2b$10$notarealhash" }),
    ]);

    expect(container.textContent).not.toContain("$2b$");
    expect(container.textContent.toLowerCase()).not.toContain("hash");
  });
});
