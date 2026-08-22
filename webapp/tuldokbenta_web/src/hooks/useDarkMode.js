// hooks/useDarkMode.js
import { useEffect, useState } from "react";
import { THEME_KEY } from "../utils/storage";

/**
 * The colour scheme toggle, lifted out of the navbar.
 *
 * The bar and the mobile drawer both offer the switch, and a hook keeps them
 * driving one piece of state instead of two that can disagree.
 *
 * The initial value is deliberately re-read from storage rather than assumed:
 * an inline script in index.html has already applied the class by the time
 * React mounts, so this only has to agree with it.
 *
 * @returns {[boolean, () => void]} current state and a toggle
 */
export function useDarkMode() {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "dark";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    try {
      localStorage.setItem(THEME_KEY, darkMode ? "dark" : "light");
    } catch (error) {
      // The choice still applies for this session, it just won't be remembered.
      console.error("Could not persist the theme:", error);
    }
  }, [darkMode]);

  return [darkMode, () => setDarkMode((on) => !on)];
}
