/**
 * Subject: components/shared/RequireRole.jsx and the roles in navItems.js
 *
 * Replaces ProtectedRoute.test.jsx. Those properties described a mechanism that
 * no longer exists — a typed password compared against a bundled env var — but
 * the intent they pinned survives the rewrite: only the permitted get through,
 * and the default is denial. That is what P1–P3 assert against the new guard.
 *
 * Validates ticket 07 requirements 5.2, 5.3, 5.4, 5.6, 7.1.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as fc from "fast-check";

import RequireRole from "../components/shared/RequireRole";
import { NAV_GROUPS, ROLES, rolesForPath, visibleGroups } from "../components/shared/navItems";
import { clearSession, setSession } from "../utils/session";

const ALL_ROLES = [ROLES.WORKER, ROLES.MANAGER, ROLES.SUPER_ADMIN];

const sessionFor = (role, mustChange = false) => ({
  accessToken: "access",
  refreshToken: "refresh",
  user: {
    id: 1,
    username: "tester",
    full_name: "Tester",
    role,
    must_change_password: mustChange,
  },
  shops: [{ id: 1, name: "Spincredible", slug: "spincredible" }],
});

/**
 * Renders the guard at /secret and reports where it landed.
 *
 * The three redirect targets get distinguishable stubs so a test can tell
 * "bounced to login" from "bounced to the till" — the difference between not
 * being signed in and being the wrong role, which the guard must not conflate.
 */
const landingFor = (roles, session, at = "/secret") => {
  if (session) setSession(session);
  else clearSession();

  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route
          path={at}
          element={
            <RequireRole roles={roles}>
              <div data-testid="landed">content</div>
            </RequireRole>
          }
        />
        <Route path="/login" element={<div data-testid="landed">login</div>} />
        <Route path="/change-password" element={<div data-testid="landed">change</div>} />
        <Route path="/open-sales" element={<div data-testid="landed">till</div>} />
      </Routes>
    </MemoryRouter>
  );

  const landed = screen.getByTestId("landed").textContent;
  cleanup();
  return landed;
};

beforeEach(() => {
  localStorage.clear();
  clearSession();
});

afterEach(() => {
  cleanup();
  clearSession();
  localStorage.clear();
});

describe("RequireRole — example-based baseline", () => {
  it("renders the page for a permitted role", () => {
    expect(landingFor([ROLES.MANAGER], sessionFor(ROLES.MANAGER))).toBe("content");
  });

  it("sends a signed-out visitor to the login form", () => {
    expect(landingFor(ALL_ROLES, null)).toBe("login");
  });

  it("sends an unpermitted role to the till rather than an empty page", () => {
    expect(landingFor([ROLES.MANAGER], sessionFor(ROLES.WORKER))).toBe("till");
  });

  it("treats a session with no role as denied", () => {
    expect(landingFor(ALL_ROLES, sessionFor(undefined))).toBe("till");
  });
});

// ---------------------------------------------------------------------------
// P1 — the guard admits exactly the listed roles
// ---------------------------------------------------------------------------
describe("P1 — admits exactly the listed roles", () => {
  it("renders if and only if the role is in the permitted list", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_ROLES),
        fc.uniqueArray(fc.constantFrom(...ALL_ROLES)),
        (role, permitted) => {
          const landed = landingFor(permitted, sessionFor(role));
          return landed === (permitted.includes(role) ? "content" : "till");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("denies any role string that is not one of the three", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !ALL_ROLES.includes(s)),
        (role) => landingFor(ALL_ROLES, sessionFor(role)) === "till"
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// P2 — nav and guards cannot disagree
// ---------------------------------------------------------------------------
describe("P2 — rolesForPath agrees with the nav groups", () => {
  it("returns the owning group's roles for every path in the nav", () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(rolesForPath(item.to)).toEqual(group.roles);
      }
    }
  });

  it("fails closed for a path no group owns", () => {
    expect(rolesForPath("/not-a-page")).toEqual([]);
    expect(landingFor(rolesForPath("/not-a-page"), sessionFor(ROLES.SUPER_ADMIN))).toBe("till");
  });

  it("shows a group in the nav exactly when its pages are reachable", () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL_ROLES), (role) => {
        const shown = visibleGroups(role).map((g) => g.id);
        return NAV_GROUPS.every((group) => {
          const reachable = group.items.every((item) =>
            rolesForPath(item.to).includes(role)
          );
          return shown.includes(group.id) === reachable;
        });
      }),
      { numRuns: 50 }
    );
  });

  it("matches the permission matrix in the overview", () => {
    expect(visibleGroups(ROLES.WORKER).map((g) => g.id)).toEqual(["sales"]);
    expect(visibleGroups(ROLES.MANAGER).map((g) => g.id)).toEqual([
      "sales",
      "manage",
      "report",
    ]);
    expect(visibleGroups(ROLES.SUPER_ADMIN).map((g) => g.id)).toEqual([
      "sales",
      "manage",
      "report",
    ]);
    expect(visibleGroups(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// P3 — a pending password change outranks everything
// ---------------------------------------------------------------------------
describe("P3 — must_change_password outranks the role check", () => {
  it("redirects to the change-password screen whatever the role and list", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_ROLES),
        fc.uniqueArray(fc.constantFrom(...ALL_ROLES)),
        (role, permitted) =>
          landingFor(permitted, sessionFor(role, true)) === "change"
      ),
      { numRuns: 100 }
    );
  });

  it("still sends a signed-out visitor to login, not to change-password", () => {
    expect(landingFor(ALL_ROLES, null)).toBe("login");
  });
});
