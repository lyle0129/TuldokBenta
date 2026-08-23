// pages/Login.jsx
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { apiRequest } from "../api";
import { setSession } from "../utils/session";
import { useAuth } from "../hooks/useAuth";
import {
  alertClass,
  inputClass,
  labelClass,
  submitButtonClass,
} from "../components/shared/fieldStyles";
import AuthCard from "../components/shared/AuthCard";

const TILL_ROUTE = "/open-sales";

const Login = () => {
  const session = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Set by RequireRole when it turned someone away, and by ChangePassword when a
  // silent re-sign-in could not be completed.
  const from = location.state?.from?.pathname;
  const notice = location.state?.notice;

  // A signed-in user has no business on this form. `replace` so the back button
  // does not bounce them straight back to it.
  if (session) return <Navigate to={from ?? TILL_ROUTE} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await apiRequest("/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setSession(result);
      navigate(from ?? TILL_ROUTE, { replace: true });
    } catch (err) {
      // status 0 is api.js's "the server never answered", which is a different
      // problem from a rejected password and has a different fix. Showing "wrong
      // password" to someone whose wifi dropped sends them hunting for a
      // credential that was never the issue.
      setError(
        err?.status === 0
          ? "Could not reach the server. Check your connection and try again."
          : err?.message || "Could not sign in."
      );
      setSubmitting(false);
    }
  };

  return (
    <AuthCard title="Sign in" subtitle="Use the account your manager set up for you.">
      {notice && (
        <p className="rounded-md border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 px-4 py-2 text-sm text-blue-700 dark:text-blue-300">
          {notice}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="username">
            Username
          </label>
          <input
            id="username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
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
          <LogIn size={18} aria-hidden="true" />
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthCard>
  );
};

export default Login;
