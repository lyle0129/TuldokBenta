// components/admin/UsersList.jsx
import { KeyRound, Pencil, Store, Trash2 } from "lucide-react";
import { canDelete } from "../../hooks/useAdminUsers";
import {
  rowCardClass,
  rowActionsClass,
  rowActionClass,
  rowActionAccents,
} from "../shared/fieldStyles";

const ROLE_LABELS = {
  super_admin: "Super Admin",
  manager: "Manager",
  worker: "Worker",
};

const ROLE_COLORS = {
  super_admin:
    "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200 border-purple-200 dark:border-purple-700",
  manager:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-700",
  worker:
    "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600",
};

/** Why Delete is unavailable, said where the button is rather than after the click. */
const DELETE_BLOCKED =
  "This account has signed in, so the audit log names it. Deactivate it instead.";

/**
 * Every account, with what can be done to it.
 *
 * Two refusals are anticipated here rather than left to the server: the hard
 * delete for an account that has acted, and deactivating yourself. Both are
 * still enforced server-side — that is where the authority is — but a button
 * that is going to be refused every time should say so before it is pressed.
 *
 * Nothing password-shaped is rendered anywhere in this component. `toPublicUser`
 * on the backend means a hash never arrives in the first place; not reaching for
 * one here is the half that stays true if that ever changes.
 */
const UsersList = ({
  users,
  shopsById,
  currentUserId,
  onEdit,
  onAssignShops,
  onResetPassword,
  onToggleActive,
  onDelete,
  emptyMessage = "No users yet.",
}) => {
  if (users.length === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400 text-center italic py-8">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-4 text-gray-800 dark:text-gray-100">
      {users.map((user) => {
        const isSelf = user.id === currentUserId;
        const deletable = canDelete(user);
        const shopNames = (user.shop_ids ?? [])
          .map((id) => shopsById[id]?.name)
          .filter(Boolean);

        return (
          <div
            key={user.id}
            className={`${rowCardClass} ${user.is_active ? "" : "opacity-70"}`}
          >
            <div className="min-w-0">
              <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 break-words">
                {user.full_name || user.username}
                {isSelf && (
                  <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                    (you)
                  </span>
                )}
              </h3>

              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                  {user.username}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                    ROLE_COLORS[user.role] ?? ROLE_COLORS.worker
                  }`}
                >
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                    user.is_active
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-700"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600"
                  }`}
                >
                  {user.is_active ? "Active" : "Inactive"}
                </span>
                {user.must_change_password && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium border bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200 border-orange-200 dark:border-orange-700">
                    Must change password
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                {user.role === "super_admin"
                  ? "Every active shop"
                  : shopNames.length > 0
                    ? shopNames.join(" · ")
                    : "No shops assigned"}
              </p>

              {!deletable && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {DELETE_BLOCKED}
                </p>
              )}
            </div>

            <div className={rowActionsClass}>
              <button
                type="button"
                onClick={() => onEdit(user)}
                className={rowActionClass(rowActionAccents.yellow)}
              >
                <Pencil size={16} className="flex-shrink-0" aria-hidden="true" />
                Edit
              </button>

              <button
                type="button"
                onClick={() => onAssignShops(user)}
                className={rowActionClass(rowActionAccents.blue)}
              >
                <Store size={16} className="flex-shrink-0" aria-hidden="true" />
                Shops
              </button>

              <button
                type="button"
                onClick={() => onResetPassword(user)}
                className={rowActionClass(rowActionAccents.purple)}
              >
                <KeyRound size={16} className="flex-shrink-0" aria-hidden="true" />
                Password
              </button>

              {/* The primary removal action, and it is deliberately not Delete:
                  deactivating keeps the account's name on every audit row it
                  produced, and it is reversible. */}
              <button
                type="button"
                onClick={() => onToggleActive(user)}
                disabled={isSelf && user.is_active}
                title={
                  isSelf && user.is_active
                    ? "You cannot deactivate your own account"
                    : undefined
                }
                aria-pressed={user.is_active}
                className={rowActionClass(
                  user.is_active ? rowActionAccents.gray : rowActionAccents.green
                )}
              >
                {user.is_active ? "Deactivate" : "Reactivate"}
              </button>

              {/* Offered only for an account that has never signed in, and
                  disabled with the reason rather than hidden — a missing button
                  is a question, a disabled one with a sentence is an answer. */}
              <button
                type="button"
                onClick={() => onDelete(user)}
                disabled={!deletable || isSelf}
                title={!deletable ? DELETE_BLOCKED : undefined}
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

export default UsersList;
