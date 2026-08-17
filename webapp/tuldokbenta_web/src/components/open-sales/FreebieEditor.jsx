// components/open-sales/FreebieEditor.jsx

/**
 * Picks the concrete inventory items for a service's freebie slots.
 *
 * This block used to exist three times over — in OpenSales, OpenSalesOffline
 * and EditSaleModal — each with its own subtly different clamping. It's kept
 * shape-agnostic (the caller passes `slots`, whether that came from a cart
 * line's `quantity` or a sale line's `qty`) so all three can share it.
 *
 * @param {object[]} freebies  [{ classification, choices: [{ item, qty }] }]
 * @param {number}   slots     free picks available per classification
 */
const FreebieEditor = ({
  freebies = [],
  slots,
  inventory = [],
  onAddChoice,
  onChangeItem,
  onChangeQty,
  onRemoveChoice,
}) => {
  if (freebies.length === 0) return null;

  return (
    <div className="mt-3 space-y-3">
      {freebies.map((f, fIdx) => {
        const choices = f.choices || [];
        const used = choices.reduce((sum, c) => sum + (Number(c.qty) || 0), 0);
        const remaining = slots - used;
        const options = inventory.filter(
          (inv) => inv.item_classification === f.classification
        );

        return (
          <div
            key={fIdx}
            className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50/60 dark:bg-green-950/40 p-3"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-green-800 dark:text-green-300">
                Free {f.classification}
              </span>
              <span
                className={`text-xs font-medium ${
                  remaining > 0
                    ? "text-orange-600 dark:text-orange-400"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {remaining > 0 ? `${remaining} left to claim` : "All claimed"}
              </span>
            </div>

            {choices.map((choice, cIdx) => (
              <div key={cIdx} className="flex items-center gap-2 mb-2">
                <select
                  value={choice.item || ""}
                  aria-label={`Free ${f.classification} item`}
                  onChange={(e) => onChangeItem(f.classification, cIdx, e.target.value)}
                  className={`flex-1 min-w-0 min-h-11 rounded-md border bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-2 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none ${
                    choice.item
                      ? "border-gray-300 dark:border-gray-600"
                      : "border-orange-400 dark:border-orange-600"
                  }`}
                >
                  <option value="">-- Select --</option>
                  {options.map((inv) => (
                    <option key={inv.id} value={inv.item_name}>
                      {inv.item_name}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min="1"
                  max={slots}
                  value={choice.qty}
                  aria-label={`Free ${f.classification} quantity`}
                  onChange={(e) => onChangeQty(f.classification, cIdx, e.target.value)}
                  className="w-16 flex-shrink-0 min-h-11 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-2 text-center text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />

                <button
                  type="button"
                  onClick={() => onRemoveChoice(f.classification, cIdx)}
                  aria-label={`Remove free ${f.classification}`}
                  className="flex-shrink-0 w-11 h-11 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}

            {options.length === 0 ? (
              <p className="text-xs italic text-gray-500 dark:text-gray-400">
                No {f.classification} items in inventory.
              </p>
            ) : (
              remaining > 0 && (
                <button
                  type="button"
                  onClick={() => onAddChoice(f.classification)}
                  className="min-h-11 px-3 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
                >
                  + Claim {f.classification}
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
};

export default FreebieEditor;
