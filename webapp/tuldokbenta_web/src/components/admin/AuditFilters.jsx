// components/admin/AuditFilters.jsx
import { labelClass, inputClass } from "../shared/fieldStyles";
import { actionLabel } from "../../utils/auditLabels";

/**
 * The range and the three narrowing filters.
 *
 * There is no "all time" and there is no way to clear the range: both ends are
 * required, the query is disabled without them, and the endpoint refuses a
 * request that lacks either. That is not a UI shortcut — audit_log is the one
 * table in the system designed to grow forever, and an unbounded read of it is
 * a production incident with a long fuse.
 *
 * The action list comes from the response for the range on screen, never from a
 * constant. A hardcoded copy of the backend's ACTIONS vocabulary would drift the
 * moment a new action is added, and it would offer actions that did not occur in
 * the range being looked at.
 */
const AuditFilters = ({ filters, onChange, shops = [], users = [], actions = [] }) => {
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div>
        <label className={labelClass} htmlFor="audit-from">
          From
        </label>
        <input
          id="audit-from"
          type="date"
          value={filters.from}
          max={filters.to}
          onChange={set("from")}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="audit-to">
          To
        </label>
        <input
          id="audit-to"
          type="date"
          value={filters.to}
          min={filters.from}
          onChange={set("to")}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="audit-shop">
          Shop
        </label>
        <select
          id="audit-shop"
          value={filters.shopId}
          onChange={set("shopId")}
          className={inputClass}
        >
          <option value="">Every shop</option>
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="audit-actor">
          Actor
        </label>
        <select
          id="audit-actor"
          value={filters.actorId}
          onChange={set("actorId")}
          className={inputClass}
        >
          <option value="">Anyone</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.full_name || user.username}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2 lg:col-span-1">
        <label className={labelClass} htmlFor="audit-action">
          Action
        </label>
        <select
          id="audit-action"
          value={filters.action}
          onChange={set("action")}
          className={inputClass}
          disabled={actions.length === 0}
        >
          <option value="">Everything</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {actionLabel(action)}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Only the actions that occurred in this range.
        </p>
      </div>
    </div>
  );
};

export default AuditFilters;
