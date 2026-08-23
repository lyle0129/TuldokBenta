// components/admin/AuditList.jsx
import AuditChangeSummary from "./AuditChangeSummary";
import { actionLabel } from "../../utils/auditLabels";
import { formatDateTime } from "../../utils/format";

const ROLE_LABELS = {
  super_admin: "Super Admin",
  manager: "Manager",
  worker: "Worker",
};

/**
 * The events themselves.
 *
 * Actor and role are read straight off the row rather than joined from `users`:
 * they are a snapshot of who this person was at the moment they acted, which is
 * the whole point of recording them — a worker later promoted to manager did not
 * retroactively act as one. It is also what keeps this query cheap as the table
 * grows.
 */
const AuditList = ({ events, shopsById }) => (
  <ul className="space-y-3 text-gray-800 dark:text-gray-100">
    {events.map((event) => (
      <li
        key={event.id}
        className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 bg-white dark:bg-gray-800"
      >
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {actionLabel(event.action)}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400 sm:flex-shrink-0">
            {formatDateTime(event.occurred_at)}
          </span>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
          {/* A deleted account still names itself here: the snapshot columns are
              plain text, and audit_log.actor_user_id has no foreign key for
              exactly this reason. */}
          <span className="font-medium">{event.actor_username ?? "unknown"}</span>
          {event.actor_role && (
            <span className="text-gray-500 dark:text-gray-400">
              {" "}
              · {ROLE_LABELS[event.actor_role] ?? event.actor_role}
            </span>
          )}
          <span className="text-gray-500 dark:text-gray-400">
            {" "}
            ·{" "}
            {event.shop_id
              ? (shopsById[event.shop_id]?.name ?? `Shop ${event.shop_id}`)
              : "All shops"}
          </span>
        </p>

        {event.entity_label && (
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
            <span className="text-gray-500 dark:text-gray-400">
              {event.entity_type ?? "entity"}:{" "}
            </span>
            {event.entity_label}
          </p>
        )}

        <AuditChangeSummary changes={event.changes} />
      </li>
    ))}
  </ul>
);

export default AuditList;
