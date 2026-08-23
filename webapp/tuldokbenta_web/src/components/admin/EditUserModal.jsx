// components/admin/EditUserModal.jsx
import { useEffect, useState } from "react";
import Modal from "../shared/Modal";
import { ROLES } from "../shared/navItems";
import {
  labelClass,
  inputClass,
  alertClass,
  noticeClass,
  cancelButtonClass,
  submitButtonClass,
} from "../shared/fieldStyles";

const ROLE_OPTIONS = [
  { value: ROLES.WORKER, label: "Worker" },
  { value: ROLES.MANAGER, label: "Manager" },
  { value: ROLES.SUPER_ADMIN, label: "Super Admin" },
];

/**
 * Name and role. Nothing else is editable here.
 *
 * `username` is shown disabled, not hidden: it is what the audit log's actor
 * snapshot names, so every past row would silently start reading as somebody
 * else if it moved, and the server refuses to change it. Assignments have their
 * own dialog, and the password has its own action.
 */
const EditUserModal = ({
  user,
  onClose,
  onSubmit,
  isSubmitting = false,
  errorMessage = null,
}) => {
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (user) setForm({ full_name: user.full_name ?? "", role: user.role });
  }, [user]);

  if (!user || !form) return null;

  const fullName = form.full_name.trim();
  const isValid = fullName !== "";
  const roleChanged = form.role !== user.role;

  const submit = () => {
    if (!isValid || isSubmitting) return;
    onSubmit(user.id, { full_name: fullName, role: form.role });
  };

  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title={`Edit ${user.username}`}
      accent="yellow"
      size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button type="button" onClick={onClose} className={cancelButtonClass}>
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!isValid || isSubmitting}
            className={submitButtonClass("bg-yellow-600 hover:bg-yellow-700")}
          >
            {isSubmitting ? "Saving…" : "Save Changes"}
          </button>
        </div>
      }
    >
      {errorMessage && (
        <div role="alert" className={`${alertClass} mb-4`}>
          {errorMessage}
        </div>
      )}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <label className={labelClass} htmlFor="edit-user-name">
            Full Name
          </label>
          <input
            id="edit-user-name"
            type="text"
            autoFocus
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="edit-user-username">
            Username
          </label>
          <input
            id="edit-user-username"
            type="text"
            value={user.username}
            readOnly
            disabled
            className={`${inputClass} font-mono opacity-60 cursor-not-allowed`}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Fixed — the audit log names this account by it.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="edit-user-role">
            Role
          </label>
          <select
            id="edit-user-role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className={inputClass}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {roleChanged && (
          // R5 in the overview. Role and shop list live in the access token and
          // refresh re-reads both, so a change reaches a signed-in user on their
          // next refresh — up to one access-token lifetime.
          <p className={noticeClass}>
            A signed-in user keeps their old role until their session next
            refreshes, which can take up to an hour.
          </p>
        )}
      </form>
    </Modal>
  );
};

export default EditUserModal;
