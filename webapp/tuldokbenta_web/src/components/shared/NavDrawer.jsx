// components/shared/NavDrawer.jsx
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { lockBodyScroll } from "../../utils/bodyScrollLock";
import { navRowClass } from "./navItems";

/**
 * The phone navigation, as a sheet that slides in over the page.
 *
 * The bottom edge is where a tab bar would naturally go, but CartBar already
 * lives there on the two sales pages and the two would stack. A drawer stays
 * out of the way until asked for, and gets the full height to lay the groups
 * out with headings.
 *
 * Replaces a dropdown that pushed the page down and closed only if you happened
 * to tap a link — not on Escape, not on tapping away, not on navigating.
 */
const NavDrawer = ({ id, open, onClose, groups, footer }) => {
  const { pathname } = useLocation();
  // Drives the slide. Kept apart from `open` so the panel can mount off-screen
  // and transition in on the next frame; a panel that mounts already in place
  // has nothing to animate from.
  const [slidIn, setSlidIn] = useState(false);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => setSlidIn(true));
    return () => {
      cancelAnimationFrame(frame);
      setSlidIn(false);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Covers the back button and any link outside the drawer.
  useEffect(() => {
    if (open) onClose();
    // Deliberately keyed on the path alone: `open` and `onClose` change for
    // reasons that have nothing to do with navigating, and including them would
    // slam the drawer shut the moment it opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!open) return null;

  // No `md:hidden` on the backdrop: only the mobile button opens the drawer, and
  // hiding an open one at a breakpoint would leave the body scroll lock held by
  // an overlay the user can no longer see or dismiss.
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex justify-end"
      onMouseDown={(e) => {
        // Same guard as Modal: only a press that starts on the backdrop closes,
        // so dragging a selection out of the panel doesn't dismiss it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={`h-full w-[85%] max-w-xs bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl flex flex-col transition-transform duration-200 motion-reduce:transition-none ${
          slidIn ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-4 h-14 border-b border-gray-200 dark:border-gray-700">
          <span className="font-bold text-blue-600 dark:text-blue-400 tracking-tight">
            Spincredible
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="-mr-2 w-11 h-11 flex items-center justify-center rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {groups.map((group) => (
            <div key={group.id}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 px-3 pt-4 pb-1">
                {group.label}
              </p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) => navRowClass(isActive)}
                >
                  <item.icon
                    size={18}
                    aria-hidden="true"
                    className="flex-shrink-0"
                  />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Safe-area padding so the actions clear the home indicator, matching
            CartBar and Modal's footer. */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-2">
          {footer}
        </div>
      </div>
    </div>
  );
};

export default NavDrawer;
