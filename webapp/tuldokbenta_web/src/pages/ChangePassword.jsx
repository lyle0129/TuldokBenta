// pages/ChangePassword.jsx
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { apiRequest } from "../api";
import { clearSession, setSession } from "../utils/session";
import { useAuth } from "../hooks/useAuth";
import {
  alertClass,
  inputClass,
  labelClass,
  submitButtonClass,
} from "../components/shared/fieldStyles";
import AuthCard from "../components/shared/AuthCard";

const TILL_ROUTE = "/open-sales";

/** Mirrors MIN_PASSWORD_LENGTH in backend/utils/passwords.js, which is authoritative. */
const MIN_PASSWORD_LENGTH = 8;

const ChangePassword = () => {
  const session = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (!session) return <Navigate to="/login" replace />;

  const forced = Boolean(session.user?.must_change_password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Checked here rather than left to the server because the server never sees
    // the confirmation field — it exists only to catch a typo in a value nobody
    // can read back.
    if (newPassword !== confirmPassword) {
      setError("The two new passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      await apiRequest("/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
    } catch (err) {
      setError(
        err?.status === 0
          ? "Could not reach the server. Check your connection and try again."
          : err?.message || "Could not change the password."
      );
      setSubmitting(false);
      return;
    }

    // The change bumped this account's token_version, which strands the refresh
    // token we are holding — the response carries no replacement, by design. The
    // access token still works, so doing nothing here would look fine and then
    // sign the user out an hour later when the refresh was refused. Signing in
    // again is what mints a usable pair, and it also returns the updated profile
    // with must_change_password cleared.
    try {
      const result = await apiRequest("/auth/login", {
        method: "POST",
        body: { username: session.user.username, password: newPassword },
      });
      setSession(result);
      navigate(TILL_ROUTE, { replace: true });
    } catch {
      // The password did change; only the re-sign-in failed. Send them to the
      // login form with the new password rather than leaving them on a screen
      // whose "current password" is now wrong.
      clearSession();
      navigate("/login", {
        replace: true,
        state: { notice: "Password changed. Sign in with your new password." },
      });
    }
  };

  return (
    <AuthCard
      title="Change your password"
      subtitle={
        forced
          ? "This account is still on the password an admin set for it. Choose your own to continue."
          : `Signed in as ${session.user?.username}.`
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="currentPassword">
            Current password
          </label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="newPassword">
            New password
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            className={inputClass}
          />
          {/* Stated before submit, not after a rejection. */}
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="confirmPassword">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            className={inputClass}
          />
        </div>

        {error && (
          <p role="alert" className={alertClass}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className={`${submitButtonClass(
            "bg-blue-600 hover:bg-blue-700"
          )} w-full flex items-center justify-center gap-2`}
        >
          <KeyRound size={18} aria-hidden="true" />
          {submitting ? "Saving…" : "Change password"}
        </button>
      </form>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Changing your password signs this account out on every other device.
      </p>
    </AuthCard>
  );
};

export default ChangePassword;
