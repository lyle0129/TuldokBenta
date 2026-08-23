// components/admin/ResetPasswordModal.jsx
import { useEffect, useState } from "react";
import Modal from "../shared/Modal";
import PasswordOnce, { PasswordField } from "./PasswordOnce";
import { generatePassword } from "../../utils/generatePassword";
import {
  alertClass,
  noticeClass,
  cancelButtonClass,
  submitButtonClass,
} from "../shared/fieldStyles";

/**
 * Setting somebody else's password.
 *
 * Two phases, like AddUserModal, and for the same reason: the API never returns
 * a password, so the panel after the save is the only place this string is ever
 * legible.
 *
 * The reset also bumps token_version server-side, which signs the account out
 * everywhere — the behaviour you want when the reason for the reset is that
 * somebody lost control of the account. The dialog says so, because it is a
 * consequence an admin resetting a forgotten password does not expect.
 */
const ResetPasswordModal = ({
  user,
  onClose,
  onSubmit,
  isSubmitting = false,
  errorMessage = null,
}) => {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (user) {
      setPassword(generatePassword());
      setDone(false);
    }
  }, [user]);

  if (!user) return null;

  const isValid = password.length >= 8;

  const submit = async () => {
    if (!isValid || isSubmitting) return;
    if (await onSubmit(user.id, password)) setDone(true);
  };

  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title={done ? "Password Reset" : `Reset password for ${user.username}`}
      accent={done ? "green" : "purple"}
      size="md"
      footer={
        done ? (
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
              className={submitButtonClass("bg-purple-600 hover:bg-purple-700")}
            >
              {isSubmitting ? "Resetting…" : "Reset Password"}
            </button>
          </div>
        )
      }
    >
      {done ? (
        <PasswordOnce password={password} username={user.username} />
      ) : (
        <div className="space-y-4">
          {errorMessage && (
            <div role="alert" className={alertClass}>
              {errorMessage}
            </div>
          )}

          <p className={noticeClass}>
            This signs {user.username} out of every device immediately, and they
            will be asked to choose a new password when they sign back in.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <PasswordField
              id="reset-password"
              label="New Password"
              value={password}
              onChange={setPassword}
            />
          </form>
        </div>
      )}
    </Modal>
  );
};

export default ResetPasswordModal;
