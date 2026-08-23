// components/admin/ShopCheckboxes.jsx
import { labelClass } from "../shared/fieldStyles";

/**
 * Which shops a person works at, shared by the create and assign dialogs.
 *
 * Inactive shops are shown only when the user is already assigned to one, so a
 * retired branch does not clutter the list but an existing assignment to it is
 * still visible and removable — silently dropping it from the UI would make the
 * assignment editor lie about what it is about to save, since setUserShops
 * replaces the whole set rather than diffing it.
 *
 * A super admin's assignments are recorded but never consulted: they reach every
 * active shop by role. Storing them anyway keeps the row meaningful if they are
 * ever demoted, which is why the note below appears rather than the list being
 * disabled.
 */
const ShopCheckboxes = ({ shops, selected, onChange, role, idPrefix }) => {
  const visible = shops.filter((shop) => shop.is_active || selected.includes(shop.id));

  const toggle = (id) =>
    onChange(
      selected.includes(id)
        ? selected.filter((existing) => existing !== id)
        : [...selected, id]
    );

  return (
    <div>
      <span className={labelClass}>Assigned Shops</span>

      {visible.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No shops yet. Create one first.
        </p>
      ) : (
        <div className="space-y-1 rounded-md border border-gray-300 dark:border-gray-600 p-2 max-h-56 overflow-y-auto">
          {visible.map((shop) => (
            <label
              key={shop.id}
              htmlFor={`${idPrefix}-shop-${shop.id}`}
              className="flex items-center gap-3 px-2 min-h-11 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
            >
              <input
                id={`${idPrefix}-shop-${shop.id}`}
                type="checkbox"
                checked={selected.includes(shop.id)}
                onChange={() => toggle(shop.id)}
                className="w-5 h-5 accent-blue-600 flex-shrink-0"
              />
              <span className="text-sm text-gray-800 dark:text-gray-100 truncate">
                {shop.name}
              </span>
              {!shop.is_active && (
                <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                  inactive
                </span>
              )}
            </label>
          ))}
        </div>
      )}

      {role === "super_admin" && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          A super admin reaches every active shop regardless of what is ticked
          here. These assignments only take effect if the account is later
          changed to manager or worker.
        </p>
      )}
    </div>
  );
};

export default ShopCheckboxes;
