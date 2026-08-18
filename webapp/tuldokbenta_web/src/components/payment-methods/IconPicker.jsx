// components/payment-methods/IconPicker.jsx
import {
  PAYMENT_ICON_OPTIONS,
  PAYMENT_ICONS,
} from "../../utils/paymentMethods";

/**
 * The icon a method carries through every report.
 *
 * A fixed set rather than free text: the slug is resolved to a lucide component
 * at render time, so anything outside this list would silently fall back to the
 * generic wallet.
 */
const IconPicker = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {PAYMENT_ICON_OPTIONS.map(({ slug, label }) => {
      const Icon = PAYMENT_ICONS[slug];
      const selected = value === slug;

      return (
        <button
          key={slug}
          type="button"
          onClick={() => onChange(slug)}
          aria-pressed={selected}
          aria-label={label}
          title={label}
          className={`w-14 h-14 flex flex-col items-center justify-center gap-0.5 rounded-md border transition-colors ${
            selected
              ? "bg-blue-100 dark:bg-blue-900 border-blue-400 dark:border-blue-600 text-blue-800 dark:text-blue-200"
              : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          }`}
        >
          <Icon size={20} aria-hidden="true" />
          <span className="text-[10px] leading-none">{label}</span>
        </button>
      );
    })}
  </div>
);

export default IconPicker;
