// components/payment-methods/PaymentMethodsList.jsx
import { ChevronUp, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { PAYMENT_ICONS, FALLBACK_ICON } from "../../utils/paymentMethods";
import {
  rowCardClass,
  rowActionsClass,
  rowActionClass,
  rowActionAccents,
} from "../shared/fieldStyles";

/** Same square arrow button as ServicesList and InventoryList. */
const arrowClass =
  "w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

/**
 * The payment method list, same card recipe as ServicesList.
 *
 * `canReorder` is false while the list is searched: ▲/▼ swap positions in the
 * full list, so offering them over a filtered subset would move a method past
 * neighbours the admin cannot see.
 */
const PaymentMethodsList = ({
  methods,
  canReorder,
  onMove,
  onToggleActive,
  onEdit,
  onDelete,
  emptyMessage = "No payment methods yet.",
}) => {
  if (methods.length === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400 text-center italic py-8">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-4 text-gray-800 dark:text-gray-100">
      {methods.map((method, index) => {
        const Icon = PAYMENT_ICONS[method.icon] || FALLBACK_ICON;
        const usage = method.usage_count ?? 0;

        return (
          <div
            key={method.id}
            className={`${rowCardClass} ${
              method.is_active ? "" : "opacity-70"
            }`}
          >
            <div className="flex items-start gap-3 min-w-0">
              {canReorder && (
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onMove(method.id, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${method.label} up`}
                    className={arrowClass}
                  >
                    <ChevronUp size={20} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(method.id, 1)}
                    disabled={index === methods.length - 1}
                    aria-label={`Move ${method.label} down`}
                    className={arrowClass}
                  >
                    <ChevronDown size={20} aria-hidden="true" />
                  </button>
                </div>
              )}

              <div className="min-w-0">
                <h3 className="flex items-center gap-2 font-semibold text-lg text-gray-900 dark:text-gray-100 break-words">
                  <Icon size={20} aria-hidden="true" />
                  {method.label}
                </h3>

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {/* The value actually written to every sale. Shown because it
                      cannot be changed later, so it is worth seeing up front. */}
                  <span className="px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                    {method.code}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                      method.is_active
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-700"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600"
                    }`}
                  >
                    {method.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {usage > 0
                    ? `Used by ${usage} closed ${usage === 1 ? "sale" : "sales"}`
                    : "Not used by any sale yet"}
                </p>
              </div>
            </div>

            <div className={rowActionsClass}>
              {/* The main way to retire a method: past sales keep their label. */}
              <button
                type="button"
                onClick={() => onToggleActive(method)}
                aria-pressed={method.is_active}
                className={rowActionClass(
                  method.is_active
                    ? rowActionAccents.gray
                    : rowActionAccents.green
                )}
              >
                {method.is_active ? "Deactivate" : "Activate"}
              </button>
              <button
                type="button"
                onClick={() => onEdit(method)}
                className={rowActionClass(rowActionAccents.yellow)}
              >
                <Pencil size={16} className="flex-shrink-0" aria-hidden="true" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(method)}
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

export default PaymentMethodsList;
