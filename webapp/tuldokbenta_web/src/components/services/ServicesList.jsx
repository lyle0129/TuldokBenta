// components/services/ServicesList.jsx
import { ChevronUp, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "../../utils/format";
import {
  rowCardClass,
  rowActionsClass,
  rowActionClass,
  rowActionAccents,
} from "../shared/fieldStyles";

/** Same square arrow button as InventoryList and the closed-sales DayPicker. */
const arrowClass =
  "w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

/**
 * The service list, as cards rather than the striped table it replaced.
 *
 * Same card recipe as InventoryList and the closed-sales list, so the three
 * lists read as one component even though each renders different fields.
 *
 * `canReorder` is false while the list is searched: ▲/▼ swap positions in the
 * full catalog, so offering them over a filtered subset would move services
 * past neighbours the admin cannot see.
 */
const ServicesList = ({
  services,
  canReorder,
  onMove,
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
      {services.map((service, index) => {
        const freebies = service.freebies || [];

        return (
          <div
            key={service.id}
            className={rowCardClass}
          >
            <div className="flex items-start gap-3 min-w-0">
              {canReorder && (
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onMove(service.id, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${service.service_name} up`}
                    className={arrowClass}
                  >
                    <ChevronUp size={20} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(service.id, 1)}
                    disabled={index === services.length - 1}
                    aria-label={`Move ${service.service_name} down`}
                    className={arrowClass}
                  >
                    <ChevronDown size={20} aria-hidden="true" />
                  </button>
                </div>
              )}

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
            </div>

            <div className={rowActionsClass}>
              <button
                type="button"
                onClick={() => onEdit(service)}
                className={rowActionClass(rowActionAccents.yellow)}
              >
                <Pencil size={16} className="flex-shrink-0" aria-hidden="true" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(service)}
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

export default ServicesList;
