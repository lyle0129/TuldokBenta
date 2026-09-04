// components/inventory/InventoryList.jsx
import { ChevronUp, ChevronDown, Plus, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "../../utils/format";
import {
  rowCardClass,
  rowActionsClass,
  rowActionClass,
  rowActionAccents,
} from "../shared/fieldStyles";

/** At or below this (and above zero) an item is flagged as running low. */
export const LOW_STOCK_THRESHOLD = 5;

/** Same square arrow button as the closed-sales DayPicker. */
const arrowClass =
  "w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

/**
 * The item list, as cards rather than the sideways-scrolling table it replaced.
 *
 * `canReorder` is false whenever the page is filtered: ▲/▼ swap positions in the
 * full catalog, so offering them over a filtered subset would move items past
 * neighbours the admin cannot see.
 */
const InventoryList = ({
  items,
  canReorder,
  onMove,
  onRestock,
  onEdit,
  onDelete,
  emptyMessage = "No items yet.",
}) => {
  if (items.length === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400 text-center italic py-8">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-4 text-gray-800 dark:text-gray-100">
      {items.map((item, index) => {
        const stock = Number(item.stock) || 0;
        const outOfStock = stock === 0;
        const low = !outOfStock && stock <= LOW_STOCK_THRESHOLD;

        return (
          <div
            key={item.id}
            className={rowCardClass}
          >
            <div className="flex items-start gap-3 min-w-0">
              {canReorder && (
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onMove(item.id, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${item.item_name} up`}
                    className={arrowClass}
                  >
                    <ChevronUp size={20} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(item.id, 1)}
                    disabled={index === items.length - 1}
                    aria-label={`Move ${item.item_name} down`}
                    className={arrowClass}
                  >
                    <ChevronDown size={20} aria-hidden="true" />
                  </button>
                </div>
              )}

              <div className="min-w-0">
                {item.item_classification && (
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                    {item.item_classification}
                  </span>
                )}
                <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 mt-0.5 break-words">
                  {item.item_name}
                </h3>
                <p className="text-base font-medium mt-1 text-gray-800 dark:text-gray-100">
                  {formatCurrency(item.price)}
                </p>
                <p
                  className={`text-sm mt-1 ${
                    outOfStock
                      ? "text-red-600 dark:text-red-400 font-semibold"
                      : low
                      ? "text-orange-600 dark:text-orange-400 font-medium"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {outOfStock
                    ? "Out of stock"
                    : `${stock} in stock${low ? " — running low" : ""}`}
                </p>
              </div>
            </div>

            {/* Two per row on a phone, a narrow column from `sm:` up — the
                same shape as the closed-sales action column. */}
            <div className={rowActionsClass}>
              <button
                type="button"
                onClick={() => onRestock(item)}
                className={rowActionClass(rowActionAccents.green)}
              >
                <Plus size={16} className="flex-shrink-0" aria-hidden="true" />
                Add Stock
              </button>
              <button
                type="button"
                onClick={() => onEdit(item)}
                className={rowActionClass(rowActionAccents.yellow)}
              >
                <Pencil size={16} className="flex-shrink-0" aria-hidden="true" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(item)}
                className={rowActionClass(rowActionAccents.red)}
              >
                <Trash2 size={16} className="flex-shrink-0" aria-hidden="true" />
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default InventoryList;
