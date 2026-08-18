// components/services/FreebiePicker.jsx

/**
 * Picks which inventory classifications a service hands out free.
 *
 * The same block existed twice on the Services page, once in the add form and
 * once in the edit modal, each with its own copy of the toggle logic.
 *
 * IMPORTANT: the values here are raw item_classification strings, matched
 * later by FreebieEditor with a case-sensitive `===` against the inventory
 * rows. They must not be normalised or prettified on the way in or a saved
 * freebie will resolve to zero items at the till.
 *
 * @param {{name: string, count: number}[]} classifications with item counts
 * @param {string[]} selected currently granted classifications
 */
const FreebiePicker = ({ classifications = [], selected = [], onToggle }) => {
  if (classifications.length === 0) {
    return (
      <p className="text-sm italic text-gray-500 dark:text-gray-400">
        No item classifications yet — add items on the Inventory page first.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {classifications.map(({ name, count }) => {
        const active = selected.includes(name);
        const empty = count === 0;

        return (
          <button
            key={name}
            type="button"
            onClick={() => onToggle(name)}
            aria-pressed={active}
            className={`px-4 min-h-11 rounded-full border text-sm font-medium transition-colors ${
              active
                ? "bg-green-600 border-green-600 text-white"
                : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            {name}
            <span
              className={`ml-1.5 ${
                empty && !active
                  ? "text-orange-600 dark:text-orange-400 font-semibold"
                  : active
                  ? "opacity-75"
                  : "opacity-60"
              }`}
            >
              ({count})
            </span>
          </button>
        );
      })}

      {/* A classification with no items behind it is a freebie the cashier can
          never claim — FreebieEditor renders an empty picker for it. */}
      {selected.some((name) =>
        classifications.some((c) => c.name === name && c.count === 0)
      ) && (
        <p className="w-full mt-1 text-xs text-orange-600 dark:text-orange-400">
          A selected classification has no items in inventory, so there will be
          nothing to hand out at the till.
        </p>
      )}
    </div>
  );
};

export default FreebiePicker;
