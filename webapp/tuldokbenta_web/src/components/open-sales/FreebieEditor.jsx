// components/open-sales/FreebieEditor.jsx
import QuantityStepper from "../shared/QuantityStepper";

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
              // The stepper is three controls wide, so the picker gets a line
              // of its own on a phone rather than being squeezed to a sliver
              // beside it. Still one row from `sm:` up.
              <div
                key={cIdx}
                className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2"
              >
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

                <div className="flex items-center gap-2">
                  {/* Deliberately not worded "increase/decrease quantity":
                      inside the cart these sit directly under the line's own
                      stepper, which is. */}
                  <QuantityStepper
                    value={choice.qty}
                    onChange={(next) => onChangeQty(f.classification, cIdx, next)}
                    label={`Free ${f.classification} quantity`}
                    decreaseLabel={`Claim one fewer free ${f.classification}`}
                    increaseLabel={`Claim one more free ${f.classification}`}
                    max={slots}
                    focusRing="focus:ring-green-500"
                  />

                  <button
                    type="button"
                    onClick={() => onRemoveChoice(f.classification, cIdx)}
                    aria-label={`Remove free ${f.classification}`}
                    className="flex-shrink-0 w-11 h-11 ml-auto sm:ml-0 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                  >
                    ✕
                  </button>
                </div>
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
