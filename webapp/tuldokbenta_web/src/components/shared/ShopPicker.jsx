// components/shared/ShopPicker.jsx
import { Store } from "lucide-react";
import { useActiveShop, setShop } from "../../hooks/useActiveShop";
import { isCartDirty } from "../../utils/cartDirty";

const SWITCH_WARNING =
  "There is a sale in progress. Switching shops will discard it. Continue?";

/**
 * Which shop the till is ringing into, and — when there is a choice — the
 * control for changing it.
 *
 * Replaces the hardcoded "Spincredible" wordmark that used to sit in the navbar
 * and again in the drawer header. That string was the only thing on screen
 * naming a shop, and with more than one shop it would have been a lie on every
 * page but one.
 *
 * With exactly one available shop this renders plain text, never a control
 * (requirement 5.3): a dropdown holding a single option invites a click that
 * does nothing, and most staff have exactly one shop.
 *
 * @param {{ variant?: "bar" | "drawer" }} props
 */
const ShopPicker = ({ variant = "bar" }) => {
  const { shopId, shop, shops } = useActiveShop();

  // Signed out, or on a page reached before a shop is resolved. The navbar does
  // not render for signed-out users, so this is mostly the /select-shop moment.
  if (shops.length === 0) return null;

  const label = shop?.name ?? "No shop selected";

  const handleChange = (event) => {
    const next = Number(event.target.value);
    if (next === shopId) return;

    // The cart lives in page state that this component cannot see; cartDirty.js
    // is how it finds out. Cancelling must leave the select showing the shop
    // still in force, which it does because `value` is driven by shopId and
    // nothing was written.
    if (isCartDirty() && !window.confirm(SWITCH_WARNING)) return;

    setShop(next);
  };

  if (shops.length === 1) {
    return (
      <span
        className={
          variant === "drawer"
            ? "font-bold text-blue-600 dark:text-blue-400 tracking-tight truncate"
            : "hidden sm:block font-bold text-lg text-blue-600 dark:text-blue-400 tracking-tight truncate max-w-40"
        }
      >
        {label}
      </span>
    );
  }

  return (
    <label className="flex items-center gap-2 min-w-0">
      <Store
        size={16}
        aria-hidden="true"
        className="flex-shrink-0 text-blue-600 dark:text-blue-400"
      />
      {/* Visually hidden rather than absent: the select is the only control in
          the bar with no visible text of its own explaining what it changes. */}
      <span className="sr-only">Active shop</span>
      <select
        value={shopId ?? ""}
        onChange={handleChange}
        className={`min-h-11 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 text-sm font-semibold text-blue-600 dark:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          variant === "drawer" ? "w-full" : "max-w-40"
        }`}
      >
        {shopId === null && (
          <option value="" disabled>
            Choose a shop…
          </option>
        )}
        {shops.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
};

export default ShopPicker;
