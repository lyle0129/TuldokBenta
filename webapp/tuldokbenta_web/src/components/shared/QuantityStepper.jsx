// components/shared/QuantityStepper.jsx
import { Minus, Plus } from "lucide-react";

/**
 * −/+ either side of a quantity, for the places a cashier nudges a number by
 * one: a cart line, a sale line in the edit modal, a claimed freebie.
 *
 * The number stays a real input rather than plain text — ringing up twenty of
 * something shouldn't mean twenty taps — so this is a superset of the bare
 * stepper the cart used to carry and the bare number box the edit modal did.
 *
 * Nothing is clamped here beyond disabling the buttons at the ends. Every
 * caller already has to clamp what it is handed (typing over the field yields
 * "", and `Number("")` is 0), so the raw value goes straight through and only
 * the buttons do arithmetic.
 *
 * Both buttons take their whole label rather than deriving it from a name:
 * these sit next to each other inside one modal — a cart line's stepper beside
 * its freebies' — and "increase quantity" said twice is ambiguous out loud.
 */
const stepClass =
  "w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-200 dark:disabled:hover:bg-gray-700 transition-colors";

const QuantityStepper = ({
  value,
  onChange,
  label,
  decreaseLabel,
  increaseLabel,
  min = 1,
  max,
  focusRing = "focus:ring-blue-500",
  className = "",
}) => {
  const current = Number(value) || 0;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => onChange(current - 1)}
        disabled={current <= min}
        aria-label={decreaseLabel}
        title={decreaseLabel}
        className={stepClass}
      >
        <Minus size={18} aria-hidden="true" />
      </button>

      <input
        type="number"
        // `numeric` rather than `decimal`: these are all whole units.
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className={`no-spinner w-14 flex-shrink-0 min-h-11 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-1 text-center font-medium focus:ring-2 outline-none ${focusRing}`}
      />

      <button
        type="button"
        onClick={() => onChange(current + 1)}
        disabled={max !== undefined && current >= max}
        aria-label={increaseLabel}
        title={increaseLabel}
        className={stepClass}
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </div>
  );
};

export default QuantityStepper;
