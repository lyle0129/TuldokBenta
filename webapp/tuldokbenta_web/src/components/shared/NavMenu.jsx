// components/shared/NavMenu.jsx
import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { navRowClass } from "./navItems";

/**
 * One dropdown in the desktop bar.
 *
 * Seven links in a row left no space for anything else and grew wider with
 * every page added. Collapsing them into labelled groups means the bar takes
 * the same three slots whether there are seven destinations or fifteen.
 */
const NavMenu = ({ group }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const { pathname } = useLocation();

  const isActiveGroup = group.items.some((item) => item.to === pathname);

  // Navigating closes the menu. Clicking an item inside it is the usual way in,
  // but this also covers the back button and links elsewhere on the page.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Focus would otherwise land on <body>, stranding keyboard users at the
      // top of the document.
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const focusFirstItem = () => {
    // Waits a frame so the panel exists before we reach into it.
    requestAnimationFrame(() =>
      containerRef.current?.querySelector("[role='menuitem']")?.focus()
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown") return;
          e.preventDefault();
          setOpen(true);
          focusFirstItem();
        }}
        className={`inline-flex items-center gap-1.5 px-3 min-h-11 rounded-md text-sm font-medium transition-colors ${
          isActiveGroup
            ? "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
            : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        }`}
      >
        {group.label}
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`transition-transform duration-200 motion-reduce:transition-none ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={group.label}
          className="absolute left-0 top-full mt-2 min-w-56 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-1.5"
        >
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={({ isActive }) => navRowClass(isActive)}
            >
              {/* Dot notation, so the icon stays a component reference without
                  a local alias the linter reads as unused. */}
              <item.icon size={18} aria-hidden="true" className="flex-shrink-0" />
              <span className="whitespace-nowrap">{item.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
};

export default NavMenu;
