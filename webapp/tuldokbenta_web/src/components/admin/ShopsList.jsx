// components/admin/ShopsList.jsx
import { Pencil, Receipt } from "lucide-react";
import {
  rowCardClass,
  rowActionsClass,
  rowActionClass,
  rowActionAccents,
} from "../shared/fieldStyles";

/**
 * Every shop, active and inactive.
 *
 * There is no delete action here and there must not be one: sales, inventory,
 * services, payment methods and audit rows all reference shops(id), and the
 * backend exposes no DELETE route to call. Deactivation is the removal path —
 * it hides the shop from every picker while leaving its rows exactly where they
 * are, and it is reversible.
 */
const ShopsList = ({
  shops,
  onEdit,
  onPreview,
  onToggleActive,
  emptyMessage = "No shops yet.",
}) => {
  if (shops.length === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400 text-center italic py-8">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-4 text-gray-800 dark:text-gray-100">
      {shops.map((shop) => (
        <div
          key={shop.id}
          className={`${rowCardClass} ${shop.is_active ? "" : "opacity-70"}`}
        >
          <div className="min-w-0">
            <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 break-words">
              {shop.name}
            </h3>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              {/* The stable key every row in five tables is filed under, and
                  frozen once saved — worth seeing up front for the same reason
                  a payment method's code is. */}
              <span className="px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                {shop.slug}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                  shop.is_active
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-700"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600"
                }`}
              >
                {shop.is_active ? "Active" : "Inactive"}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                {shop.invoice_prefix}0001
              </span>
            </div>

            {shop.address_line && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                {shop.address_line}
              </p>
            )}
            {shop.contact_number && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {shop.contact_number}
              </p>
            )}
          </div>

          <div className={rowActionsClass}>
            <button
              type="button"
              onClick={() => onToggleActive(shop)}
              aria-pressed={shop.is_active}
              className={rowActionClass(
                shop.is_active ? rowActionAccents.gray : rowActionAccents.green
              )}
            >
              {shop.is_active ? "Deactivate" : "Reactivate"}
            </button>
            {/* Purple, because that is the colour Print is on every sales page —
                this shows the same document those buttons produce. */}
            <button
              type="button"
              onClick={() => onPreview(shop)}
              className={rowActionClass(rowActionAccents.purple)}
            >
              <Receipt size={16} className="flex-shrink-0" aria-hidden="true" />
              Receipt
            </button>
            <button
              type="button"
              onClick={() => onEdit(shop)}
              className={rowActionClass(rowActionAccents.yellow)}
            >
              <Pencil size={16} className="flex-shrink-0" aria-hidden="true" />
              Edit
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ShopsList;
