import { useState } from "react";
import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children }) => {
  const [authenticated, setAuthenticated] = useState(
    localStorage.getItem("authenticated") === "true"
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const correctPassword = "abc123"; // 🔒 set your own password here

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === correctPassword) {
      localStorage.setItem("authenticated", "true");
      setAuthenticated(true);
      setError("");
    } else {
      setError("Incorrect password.");
    }
  };

  if (authenticated) {
    return children;
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-sm">
        <h2 className="text-xl font-semibold mb-4 text-center">
          Protected Access
        </h2>
        <form onSubmit={handleLogin}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            className="w-full border rounded-md px-3 py-2 mb-3 focus:ring-2 focus:ring-blue-400"
          />
          {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
};

export default ProtectedRoute;
