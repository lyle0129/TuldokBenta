// components/shared/FilterTabs.jsx

/**
 * A row of filter pills, lifted out of the Inventory toolbar.
 *
 * The strip scrolls sideways rather than wrapping. That is deliberate and it is
 * the one place in the app where horizontal overflow is correct: the pills are
 * `whitespace-nowrap flex-shrink-0`, so on a phone the row runs off the edge and
 * is dragged, instead of reflowing into three ragged lines every time a filter
 * is added. `scrollbar-hide` is declared in index.css.
 */
const tabClass = (active) =>
  `px-4 min-h-11 rounded-md border text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
    active
      ? "bg-blue-600 border-blue-600 text-white"
      : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
  }`;

const FilterTabs = ({ options, value, onChange, ariaLabel }) => (
  <div
    role="tablist"
    aria-label={ariaLabel}
    className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1"
  >
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="tab"
        aria-selected={value === option.value}
        onClick={() => onChange(option.value)}
        className={tabClass(value === option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

export default FilterTabs;
