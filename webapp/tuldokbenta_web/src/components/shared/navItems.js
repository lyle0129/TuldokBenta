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

/**
 * Every destination in the navbar, in one place.
 *
 * The seven links used to be written out twice — once for the desktop row and
 * once for the mobile menu — so adding Offline Sales meant remembering to edit
 * both, and the two lists had already started to drift in styling.
 *
 * Grouping is what keeps the bar uniform: three slots on desktop no matter how
 * many pages exist. A group holding a single item renders as a plain link
 * rather than a dropdown, so Reporting stays one click away.
 *
 * `adminOnly` mirrors the routes wrapped in ProtectedRoute in App.jsx. Listing
 * a link that only leads to a password prompt is noise, so those hide until
 * the session is open.
 */
export const NAV_GROUPS = [
  {
    id: "sales",
    label: "Sales",
    items: [
      { to: "/open-sales", label: "Open Sales", icon: ShoppingCart },
      { to: "/open-sales-offline", label: "Offline Sales", icon: WifiOff },
      { to: "/closed-sales", label: "Closed Sales", icon: CheckCircle2 },
    ],
  },
  {
    id: "manage",
    label: "Manage",
    adminOnly: true,
    items: [
      { to: "/inventory", label: "Inventory", icon: Package },
      { to: "/services", label: "Services", icon: Wrench },
      { to: "/payment-methods", label: "Payment Methods", icon: CreditCard },
    ],
  },
  {
    id: "report",
    label: "Reporting",
    adminOnly: true,
    items: [{ to: "/reporting", label: "Reporting", icon: BarChart3 }],
  },
];

/** The groups a given session may see. */
export const visibleGroups = (authenticated) =>
  NAV_GROUPS.filter((group) => authenticated || !group.adminOnly);

/**
 * Where the Sign In button points.
 *
 * Hiding the admin groups also hides the only way to reach the password gate,
 * so the button sends you to the first protected page and the gate does the
 * rest.
 */
export const SIGN_IN_ROUTE = "/inventory";

/** Icon-and-label row, shared by the desktop dropdowns and the mobile drawer. */
export const navRowClass = (isActive) =>
  `flex items-center gap-3 px-3 min-h-11 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? "bg-blue-600 text-white"
      : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
  }`;
