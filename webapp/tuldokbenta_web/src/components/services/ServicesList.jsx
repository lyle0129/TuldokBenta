// components/services/ServicesList.jsx
import { Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "../../utils/format";

const actionClass = (colors) =>
  `flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 min-h-11 rounded-md border font-medium transition ${colors}`;

/**
 * The service list, as cards rather than the striped table it replaced.
 *
 * Same card recipe as InventoryList and the closed-sales list, so the three
 * lists read as one component even though each renders different fields.
 */
const ServicesList = ({
  services,
  onEdit,
  onDelete,
  emptyMessage = "No services yet.",
}) => {
  if (services.length === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400 text-center italic py-8">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-4 text-gray-800 dark:text-gray-100">
      {services.map((service) => {
        const freebies = service.freebies || [];

        return (
          <div
            key={service.id}
            className="border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 bg-white dark:bg-gray-800 hover:shadow-md transition"
          >
            <div className="min-w-0">
              <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 break-words">
                {service.service_name}
              </h3>
              <p className="text-base font-medium mt-1 text-gray-800 dark:text-gray-100">
                {formatCurrency(service.price)}
              </p>

              {freebies.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Includes free:
                  </span>
                  {freebies.map((cls) => (
                    <span
                      key={cls}
                      className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border border-green-200 dark:border-green-700"
                    >
                      {cls}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  No freebies
                </p>
              )}
            </div>

            <div className="flex sm:flex-col gap-2 text-sm sm:flex-shrink-0">
              <button
                type="button"
                onClick={() => onEdit(service)}
                className={actionClass(
                  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-yellow-200 dark:border-yellow-700 hover:bg-yellow-200 dark:hover:bg-yellow-800"
                )}
              >
                <Pencil size={16} aria-hidden="true" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(service)}
                className={actionClass(
                  "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 border-red-200 dark:border-red-700 hover:bg-red-200 dark:hover:bg-red-800"
                )}
              >
                <Trash2 size={16} aria-hidden="true" />
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ServicesList;
