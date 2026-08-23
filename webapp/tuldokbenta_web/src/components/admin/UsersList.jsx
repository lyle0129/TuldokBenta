// components/admin/UsersList.jsx
import { KeyRound, Pencil, Store, Trash2 } from "lucide-react";
import { canDelete } from "../../hooks/useAdminUsers";

const actionClass = (colors) =>
  `flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 min-h-11 rounded-md border font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${colors}`;

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
            className={`border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 bg-white dark:bg-gray-800 hover:shadow-md transition ${
              user.is_active ? "" : "opacity-70"
            }`}
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

            <div className="grid grid-cols-2 sm:flex sm:flex-col gap-2 text-sm sm:flex-shrink-0">
              <button
                type="button"
                onClick={() => onEdit(user)}
                className={actionClass(
                  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-yellow-200 dark:border-yellow-700 hover:bg-yellow-200 dark:hover:bg-yellow-800"
                )}
              >
                <Pencil size={16} aria-hidden="true" />
                Edit
              </button>

              <button
                type="button"
                onClick={() => onAssignShops(user)}
                className={actionClass(
                  "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-700 hover:bg-blue-200 dark:hover:bg-blue-800"
                )}
              >
                <Store size={16} aria-hidden="true" />
                Shops
              </button>

              <button
                type="button"
                onClick={() => onResetPassword(user)}
                className={actionClass(
                  "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200 border-purple-200 dark:border-purple-700 hover:bg-purple-200 dark:hover:bg-purple-800"
                )}
              >
                <KeyRound size={16} aria-hidden="true" />
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
                className={actionClass(
                  user.is_active
                    ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600"
                    : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-700 hover:bg-green-200 dark:hover:bg-green-800"
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

export default UsersList;
