// pages/AdminUsers.jsx
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useAdminUsers } from "../hooks/useAdminUsers";
import { useAdminShops, shopsById } from "../hooks/useAdminShops";
import { useAuth } from "../hooks/useAuth";
import SearchInput from "../components/shared/SearchInput";
import ConfirmDialog from "../components/shared/ConfirmDialog";
import FilterTabs from "../components/shared/FilterTabs";
import SortControl from "../components/shared/SortControl";
import Pagination from "../components/shared/Pagination";
import UsersList from "../components/admin/UsersList";
import AddUserModal from "../components/admin/AddUserModal";
import EditUserModal from "../components/admin/EditUserModal";
import AssignShopsModal from "../components/admin/AssignShopsModal";
import ResetPasswordModal from "../components/admin/ResetPasswordModal";
import { alertClass } from "../components/shared/fieldStyles";
import { sortRows, pageSlice } from "../utils/sortRows";

/** Matches SALES_PER_PAGE on the closed-sales list. */
const USERS_PER_PAGE = 10;

const ROLE_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "super_admin", label: "Super Admin" },
  { value: "manager", label: "Manager" },
  { value: "worker", label: "Worker" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

/**
 * How each sort field is read off a user. Accessors rather than column names,
 * for the same reason as on Shops: nothing here reaches the server.
 *
 * "Last sign-in" is the one that needs `compareValues`' blanks-last rule — an
 * account that has never signed in has a null there, and it belongs at the
 * bottom whichever way the arrow points.
 */
const SORT_FIELDS = [
  { value: "name", label: "Name", get: (u) => u.full_name || u.username },
  { value: "username", label: "Username", get: (u) => u.username },
  { value: "role", label: "Role", get: (u) => u.role },
  { value: "status", label: "Status", get: (u) => Boolean(u.is_active) },
  { value: "last_login", label: "Last sign-in", get: (u) => u.last_login_at },
];

/**
 * Who can sign in, as what, and where.
 *
 * Every refusal shown on this page is the server's own sentence. The three the
 * backend can produce — last super admin, self-deactivation, delete with
 * activity — are conditions only the database can evaluate, and paraphrasing
 * them here would put a second, drifting copy of those rules in the UI.
 */
const AdminUsers = () => {
  const session = useAuth();
  const {
    users,
    isLoading,
    error,
    mutationError,
    isMutating,
    resetErrors,
    createUser,
    updateUser,
    setUserActive,
    setUserShops,
    resetPassword,
    deleteUser,
  } = useAdminUsers();
  const { shops } = useAdminShops();

  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [assigningUser, setAssigningUser] = useState(null);
  const [resettingUser, setResettingUser] = useState(null);
  const [togglingUser, setTogglingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);

  const byId = useMemo(() => shopsById(shops), [shops]);
  const term = query.trim().toLowerCase();

  const matchingUsers = useMemo(() => {
    const filtered = users.filter((user) => {
      if (role !== "all" && user.role !== role) return false;
      if (status === "active" && !user.is_active) return false;
      if (status === "inactive" && user.is_active) return false;
      if (!term) return true;
      return (
        user.username?.toLowerCase().includes(term) ||
        user.full_name?.toLowerCase().includes(term) ||
        user.role?.toLowerCase().includes(term)
      );
    });

    const field = SORT_FIELDS.find((f) => f.value === sortBy) ?? SORT_FIELDS[0];
    return sortRows(filtered, field.get, sortOrder);
  }, [users, term, role, status, sortBy, sortOrder]);

  // Narrowing the list under someone standing on page 3 would otherwise leave
  // them on a blank page with no way back.
  useEffect(() => {
    setPage(1);
  }, [term, role, status, sortBy, sortOrder]);

  const {
    rows: visibleUsers,
    totalPages,
    page: safePage,
  } = pageSlice(matchingUsers, page, USERS_PER_PAGE);

  const activeCount = users.filter((u) => u.is_active).length;

  const handleCreate = (user) => createUser(user);

  const handleEditSave = async (id, updates) => {
    if (await updateUser(id, updates)) setEditingUser(null);
  };

  const handleAssignSave = async (id, shopIds) => {
    if (await setUserShops(id, shopIds)) setAssigningUser(null);
  };

  const handleResetSave = (id, password) => resetPassword(id, password);

  // The confirm dialogs have nowhere to render an error, so a refusal surfaces
  // in the page-level banner — the same split PaymentMethods uses.
  const handleToggleConfirm = async () => {
    if (!togglingUser) return;
    await setUserActive(togglingUser.id, !togglingUser.is_active);
    setTogglingUser(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingUser) return;
    await deleteUser(deletingUser.id);
    setDeletingUser(null);
  };

  const openModal = (setter) => (user) => {
    // A failed action's message must not follow the admin into the next dialog.
    resetErrors();
    setter(user);
  };

  const isFormOpen =
    isAdding ||
    editingUser !== null ||
    assigningUser !== null ||
    resettingUser !== null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-5 text-gray-800 dark:text-gray-100">
        Users
      </h1>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 mb-6 transition-colors space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search name, username or role…"
            ariaLabel="Search users"
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => {
              resetErrors();
              setIsAdding(true);
            }}
            className="flex items-center justify-center gap-2 px-6 min-h-11 rounded-md bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold transition flex-shrink-0"
          >
            <Plus size={18} aria-hidden="true" />
            New User
          </button>
        </div>

        <FilterTabs
          options={ROLE_OPTIONS}
          value={role}
          onChange={setRole}
          ariaLabel="Filter users by role"
        />

        <FilterTabs
          options={STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
          ariaLabel="Filter users by status"
        />

        <SortControl
          idPrefix="users"
          fields={SORT_FIELDS}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onChange={(field, order) => {
            setSortBy(field);
            setSortOrder(order);
          }}
        />

        {/* The unfiltered totals — the figure worth knowing at a glance. The
            filtered range is Pagination's "Showing X–Y of N". */}
        <div className="pt-1 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 pt-3">
            <span className="font-semibold text-gray-800 dark:text-gray-100">
              {users.length} {users.length === 1 ? "user" : "users"}
            </span>
            {" · "}
            <span className="font-semibold text-green-700 dark:text-green-400">
              {activeCount} active
            </span>
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 transition-colors">
        {mutationError && !isFormOpen && (
          <div role="alert" className={`${alertClass} mb-4`}>
            {mutationError}
          </div>
        )}

        {isLoading ? (
          <p className="py-10 text-center text-gray-500 dark:text-gray-400 animate-pulse">
            Loading users…
          </p>
        ) : error ? (
          <p role="alert" className="py-10 text-center text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : (
          <>
            <UsersList
              users={visibleUsers}
              shopsById={byId}
              currentUserId={session?.user?.id ?? null}
              onEdit={openModal(setEditingUser)}
              onAssignShops={openModal(setAssigningUser)}
              onResetPassword={openModal(setResettingUser)}
              onToggleActive={openModal(setTogglingUser)}
              onDelete={openModal(setDeletingUser)}
              emptyMessage={
                users.length === 0
                  ? "No users yet. Create your first one above."
                  : term
                    ? `No users match “${query}”.`
                    : "No users match these filters."
              }
            />

            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={matchingUsers.length}
              pageSize={USERS_PER_PAGE}
            />
          </>
        )}
      </div>

      <AddUserModal
        open={isAdding}
        onClose={() => setIsAdding(false)}
        onSubmit={handleCreate}
        shops={shops}
        existingUsernames={users.map((u) => u.username)}
        isSubmitting={isMutating}
        errorMessage={mutationError}
      />

      <EditUserModal
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSubmit={handleEditSave}
        isSubmitting={isMutating}
        errorMessage={mutationError}
      />

      <AssignShopsModal
        user={assigningUser}
        shops={shops}
        onClose={() => setAssigningUser(null)}
        onSubmit={handleAssignSave}
        isSubmitting={isMutating}
        errorMessage={mutationError}
      />

      <ResetPasswordModal
        user={resettingUser}
        onClose={() => setResettingUser(null)}
        onSubmit={handleResetSave}
        isSubmitting={isMutating}
        errorMessage={mutationError}
      />

      <ConfirmDialog
        open={togglingUser !== null}
        title={togglingUser?.is_active ? "Deactivate User" : "Reactivate User"}
        message={
          togglingUser?.is_active
            ? `Deactivate ${togglingUser?.username}? They are signed out everywhere within the hour and cannot sign back in. Everything they did stays in the audit log under their name.`
            : `Reactivate ${togglingUser?.username}? They can sign in again with their existing password.`
        }
        confirmLabel={togglingUser?.is_active ? "Deactivate" : "Reactivate"}
        accent={togglingUser?.is_active ? "red" : "green"}
        onConfirm={handleToggleConfirm}
        onCancel={() => setTogglingUser(null)}
      />

      <ConfirmDialog
        open={deletingUser !== null}
        title="Delete Account"
        message={`Permanently delete ${deletingUser?.username}? This account has never signed in, so nothing in the audit log names it. This cannot be undone.`}
        confirmLabel="Delete"
        accent="red"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingUser(null)}
      />
    </div>
  );
};

export default AdminUsers;
