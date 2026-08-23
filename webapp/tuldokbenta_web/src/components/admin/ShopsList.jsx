// components/admin/ShopsList.jsx
import { Pencil } from "lucide-react";

/** Same card and button recipe as PaymentMethodsList, so the Console reads as one app. */
const actionClass = (colors) =>
  `flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 min-h-11 rounded-md border font-medium transition ${colors}`;

/**
 * Every shop, active and inactive.
 *
 * There is no delete action here and there must not be one: sales, inventory,
 * services, payment methods and audit rows all reference shops(id), and the
 * backend exposes no DELETE route to call. Deactivation is the removal path —
 * it hides the shop from every picker while leaving its rows exactly where they
 * are, and it is reversible.
 */
const ShopsList = ({ shops, onEdit, onToggleActive, emptyMessage = "No shops yet." }) => {
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
          className={`border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 bg-white dark:bg-gray-800 hover:shadow-md transition ${
            shop.is_active ? "" : "opacity-70"
          }`}
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

          <div className="flex sm:flex-col gap-2 text-sm sm:flex-shrink-0">
            <button
              type="button"
              onClick={() => onToggleActive(shop)}
              aria-pressed={shop.is_active}
              className={actionClass(
                shop.is_active
                  ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600"
                  : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-700 hover:bg-green-200 dark:hover:bg-green-800"
              )}
            >
              {shop.is_active ? "Deactivate" : "Reactivate"}
            </button>
            <button
              type="button"
              onClick={() => onEdit(shop)}
              className={actionClass(
                "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-yellow-200 dark:border-yellow-700 hover:bg-yellow-200 dark:hover:bg-yellow-800"
              )}
            >
              <Pencil size={16} aria-hidden="true" />
              Edit
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ShopsList;
