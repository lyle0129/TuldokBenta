// components/shared/Navbar.jsx
import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LogIn, LogOut, Menu, Moon, Sun } from "lucide-react";
import { clearQueryCache } from "../../queryClient";
import { signOut } from "../../utils/auth";
import { useAuth } from "../../hooks/useAuth";
import { useDarkMode } from "../../hooks/useDarkMode";
import NavDrawer from "./NavDrawer";
import NavMenu from "./NavMenu";
import { navRowClass, SIGN_IN_ROUTE, visibleGroups } from "./navItems";

const DRAWER_ID = "primary-navigation";

const Navbar = () => {
  const navigate = useNavigate();
  const authenticated = useAuth();
  const [darkMode, toggleDarkMode] = useDarkMode();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const groups = visibleGroups(authenticated);

  const handleLogout = () => {
    signOut();
    // The reload below used to be enough to wipe every list from memory. Now
    // that the query cache is persisted, sales data would outlive the session
    // in localStorage unless it is dropped explicitly.
    clearQueryCache();
    navigate("/");
    window.location.reload();
  };

  const ThemeIcon = darkMode ? Sun : Moon;

  // Rendered in the bar and again in the drawer footer, where it also carries a
  // label — there is room for one, and an unlabelled icon in a list of labelled
  // rows reads as an oversight.
  const sessionAction = (extraClasses = "") =>
    authenticated ? (
      <button
        type="button"
        onClick={handleLogout}
        className={`flex items-center justify-center gap-2 px-4 min-h-11 rounded-md bg-red-500 hover:bg-red-600 active:scale-95 text-white font-medium transition ${extraClasses}`}
      >
        <LogOut size={18} aria-hidden="true" />
        Logout
      </button>
    ) : (
      <Link
        to={SIGN_IN_ROUTE}
        onClick={() => setDrawerOpen(false)}
        className={`flex items-center justify-center gap-2 px-4 min-h-11 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium transition ${extraClasses}`}
      >
        <LogIn size={18} aria-hidden="true" />
        Sign In
      </Link>
    );

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <img
              src="/Spincredible.png"
              alt=""
              className="h-8 w-8 rounded-md object-contain"
            />
            {/* The wordmark drops on the narrowest phones so the mark and the
                hamburger never have to share a cramped row. */}
            <span className="hidden sm:block font-bold text-lg text-blue-600 dark:text-blue-400 tracking-tight">
              Spincredible
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {groups.map((group) =>
              // A group of one is a destination, not a menu — making Reporting
              // a dropdown would cost a click to reach a single page.
              group.items.length === 1 ? (
                <NavLink
                  key={group.id}
                  to={group.items[0].to}
                  className={({ isActive }) =>
                    `px-3 min-h-11 rounded-md text-sm font-medium transition-colors flex items-center ${
                      isActive
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`
                  }
                >
                  {group.label}
                </NavLink>
              ) : (
                <NavMenu key={group.id} group={group} />
              )
            )}

            <span
              aria-hidden="true"
              className="mx-2 h-6 w-px bg-gray-200 dark:bg-gray-700"
            />

            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label={
                darkMode ? "Switch to light mode" : "Switch to dark mode"
              }
              className="w-11 h-11 flex items-center justify-center rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ThemeIcon size={18} aria-hidden="true" />
            </button>
            {sessionAction()}
          </div>

          <button
            type="button"
            className="md:hidden -mr-2 w-11 h-11 flex items-center justify-center rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls={DRAWER_ID}
          >
            <Menu size={22} aria-hidden="true" />
          </button>
        </div>
      </nav>

      {/*
        Deliberately a sibling of <nav>, not a child.

        `backdrop-blur` sets a backdrop-filter, and any element with one becomes
        the containing block for its fixed-position descendants. Nested inside,
        the drawer's `fixed inset-0` resolved against the 56px-tall bar instead
        of the viewport: a stub panel with the links crushed out of it by
        `flex-1` and the page showing through underneath.
      */}
      <NavDrawer
        id={DRAWER_ID}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        groups={groups}
        footer={
          <>
            <button
              type="button"
              onClick={toggleDarkMode}
              className={`${navRowClass(false)} w-full`}
            >
              <ThemeIcon size={18} aria-hidden="true" />
              {darkMode ? "Light mode" : "Dark mode"}
            </button>
            {sessionAction("w-full")}
          </>
        }
      />
    </>
  );
};

export default Navbar;
