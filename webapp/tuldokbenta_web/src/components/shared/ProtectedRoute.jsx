import { useState } from "react";
import { Navigate } from "react-router-dom";
import { signIn } from "../../utils/auth";
import { useAuth } from "../../hooks/useAuth";

const ProtectedRoute = ({ children }) => {
  // Shared with the navbar rather than held locally, so signing in here unhides
  // the admin links up there without a reload.
  const authenticated = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = (e) => {
    e.preventDefault();
    const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD;
    // Fail-closed: if the env var is not set, deny all logins.
    if (!adminPassword || password !== adminPassword) {
      setError("Incorrect password.");
      return;
    }
    signIn();
    setError("");
  };

  if (authenticated) {
    return children;
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 transition-colors">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg w-full max-w-sm p-8">
        <h2 className="text-2xl font-semibold text-center text-gray-800 dark:text-gray-100 mb-6">
          🔒 Protected Access
        </h2>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 active:bg-blue-800 transition"
          >
            Enter
          </button>
        </form>

        <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-6">
          Access restricted. Authorized personnel only.
        </p>
      </div>
    </div>
  );
};

export default ProtectedRoute;
