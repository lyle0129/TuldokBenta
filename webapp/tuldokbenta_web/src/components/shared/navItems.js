// components/shared/navItems.js
import {
  BarChart3,
  CheckCircle2,
  CreditCard,
  Package,
  ShoppingCart,
  WifiOff,
  Wrench,
} from "lucide-react";

/** The three roles, matching the CHECK on `users.role` and the token's claim. */
export const ROLES = {
  WORKER: "worker",
  MANAGER: "manager",
  SUPER_ADMIN: "super_admin",
};

const ALL = [ROLES.WORKER, ROLES.MANAGER, ROLES.SUPER_ADMIN];
const MANAGERS = [ROLES.MANAGER, ROLES.SUPER_ADMIN];

/**
 * Every destination in the navbar, in one place, with who may reach it.
 *
 * The seven links used to be written out twice — once for the desktop row and
 * once for the mobile menu — so adding Offline Sales meant remembering to edit
 * both, and the two lists had already started to drift in styling.
 *
 * Grouping is what keeps the bar uniform: three slots on desktop no matter how
 * many pages exist. A group holding a single item renders as a plain link
 * rather than a dropdown, so Reporting stays one click away.
 *
 * `roles` used to be an `adminOnly` boolean that mirrored, by hand, the routes
 * wrapped in ProtectedRoute over in App.jsx — two lists that could disagree
 * about what was protected. App.jsx now derives its guards from `rolesForPath`
 * below, so this array is the only list. The roles themselves come from the
 * permission matrix in docs/specs/multipos/00-overview.md.
 */
export const NAV_GROUPS = [
  {
    id: "sales",
    label: "Sales",
    roles: ALL,
    items: [
      { to: "/open-sales", label: "Open Sales", icon: ShoppingCart },
      { to: "/open-sales-offline", label: "Offline Sales", icon: WifiOff },
      { to: "/closed-sales", label: "Closed Sales", icon: CheckCircle2 },
    ],
  },
  {
    id: "manage",
    label: "Manage",
    roles: MANAGERS,
    items: [
      { to: "/inventory", label: "Inventory", icon: Package },
      { to: "/services", label: "Services", icon: Wrench },
      { to: "/payment-methods", label: "Payment Methods", icon: CreditCard },
    ],
  },
  {
    // Hidden from workers as a convenience, NOT as a control. This page derives
    // every figure in the browser from GET /api/closed-sales and
    // GET /api/open-sales, both of which are worker-accessible by design — so a
    // worker with a valid token can fetch the same rows and compute the same
    // totals whether or not the link is on screen. Do not describe this entry as
    // protecting anything. See the permission matrix in
    // docs/specs/multipos/00-overview.md.
    id: "report",
    label: "Reporting",
    roles: MANAGERS,
    items: [{ to: "/reporting", label: "Reporting", icon: BarChart3 }],
  },
];

/** The groups a given role may see. A signed-out caller passes null and sees none. */
export const visibleGroups = (role) =>
  NAV_GROUPS.filter((group) => group.roles.includes(role));

/**
 * The roles permitted to reach a path, for App.jsx's route guards.
 *
 * Returns `[]` for a path no group owns, which denies everyone rather than
 * admitting everyone — a route added to App.jsx and forgotten here fails closed
 * and is noticed immediately.
 */
export const rolesForPath = (path) =>
  NAV_GROUPS.find((group) => group.items.some((item) => item.to === path))?.roles ?? [];

/** Icon-and-label row, shared by the desktop dropdowns and the mobile drawer. */
export const navRowClass = (isActive) =>
  `flex items-center gap-3 px-3 min-h-11 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? "bg-blue-600 text-white"
      : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
  }`;
