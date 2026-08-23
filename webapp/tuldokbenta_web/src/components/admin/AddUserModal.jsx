// components/admin/AddUserModal.jsx
import { useEffect, useState } from "react";
import Modal from "../shared/Modal";
import ShopCheckboxes from "./ShopCheckboxes";
import PasswordOnce, { PasswordField } from "./PasswordOnce";
import { generatePassword } from "../../utils/generatePassword";
import { ROLES } from "../shared/navItems";
import {
  labelClass,
  inputClass,
  alertClass,
  cancelButtonClass,
  submitButtonClass,
} from "../shared/fieldStyles";

const ROLE_OPTIONS = [
  { value: ROLES.WORKER, label: "Worker", hint: "The till, and nothing else." },
  {
    value: ROLES.MANAGER,
    label: "Manager",
    hint: "The till, plus inventory, services, payment methods and reporting.",
  },
  {
    value: ROLES.SUPER_ADMIN,
    label: "Super Admin",
    hint: "Everything, across every shop, including this console.",
  },
];

/** Usernames are normalised server-side; matching it here avoids a surprise. */
const normalizeUsername = (value) => String(value ?? "").trim().toLowerCase();

const emptyForm = () => ({
  username: "",
  full_name: "",
  role: ROLES.WORKER,
  password: generatePassword(),
  shop_ids: [],
});

/**
 * Creating an account.
 *
 * Two phases in one dialog: the form, then the password. The account is created
 * with `must_change_password` set server-side no matter what — the password
 * here was chosen by somebody else and has very likely travelled through a chat
 * message to reach its owner — so the second phase is the only chance anyone has
 * to read it. It is not skippable.
 */
const AddUserModal = ({
  open,
  onClose,
  onSubmit,
  shops = [],
  existingUsernames = [],
  isSubmitting = false,
  errorMessage = null,
}) => {
  const [form, setForm] = useState(emptyForm);
  // Non-null once the account exists. The API never returns a password, so this
  // is the value this browser sent a moment ago and nothing can recover it.
  const [created, setCreated] = useState(null);

  useEffect(() => {
    if (open) {
      setForm(emptyForm());
      setCreated(null);
    }
  }, [open]);

  const username = normalizeUsername(form.username);
  const fullName = form.full_name.trim();
  const duplicate = existingUsernames.includes(username);

  const isValid =
    username !== "" &&
    username.length <= 50 &&
    fullName !== "" &&
    form.password.length >= 8 &&
    !duplicate;

  const submit = async () => {
    if (!isValid || isSubmitting) return;

    const ok = await onSubmit({
      username,
      full_name: fullName,
      role: form.role,
      password: form.password,
      shop_ids: form.shop_ids,
    });

    // Only on success: a rejected create must leave the form up with what was
    // typed, not swap it for a password that was never set.
    if (ok) setCreated({ username, password: form.password });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={created ? "Account Created" : "New User"}
      accent={created ? "green" : "blue"}
      size="lg"
      variant="sheet"
      footer={
        created ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className={submitButtonClass("bg-green-600 hover:bg-green-700")}
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button type="button" onClick={onClose} className={cancelButtonClass}>
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!isValid || isSubmitting}
              className={submitButtonClass("bg-blue-600 hover:bg-blue-700")}
            >
              {isSubmitting ? "Creating…" : "Create User"}
            </button>
          </div>
        )
      }
    >
      {created ? (
        <PasswordOnce password={created.password} username={created.username} />
      ) : (
        <>
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
              <label className={labelClass} htmlFor="add-user-name">
                Full Name
              </label>
              <input
                id="add-user-name"
                type="text"
                autoFocus
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="e.g. Ada Reyes"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="add-user-username">
                Username
              </label>
              <input
                id="add-user-username"
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="e.g. ada"
                className={`${inputClass} font-mono`}
                autoComplete="off"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Lowercased, and fixed once saved — every audit row names the
                account by it.
              </p>
              {duplicate && (
                <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                  “{username}” is already taken.
                </p>
              )}
            </div>

            <div>
              <label className={labelClass} htmlFor="add-user-role">
                Role
              </label>
              <select
                id="add-user-role"
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
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {ROLE_OPTIONS.find((o) => o.value === form.role)?.hint}
              </p>
            </div>

            <PasswordField
              id="add-user-password"
              label="Initial Password"
              value={form.password}
              onChange={(password) => setForm({ ...form, password })}
            />

            <ShopCheckboxes
              shops={shops}
              selected={form.shop_ids}
              onChange={(shop_ids) => setForm({ ...form, shop_ids })}
              role={form.role}
              idPrefix="add-user"
            />
          </form>
        </>
      )}
    </Modal>
  );
};

export default AddUserModal;
