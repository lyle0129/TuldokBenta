// components/shared/RequireRole.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

/** Where anyone who may not be here ends up. Every role can use the till. */
const TILL_ROUTE = "/open-sales";

/**
 * Renders its children only for the roles listed, and redirects everyone else.
 *
 * Replaces ProtectedRoute, which rendered a password box comparing against a
 * Vite-inlined env var — a string served in plain text to every visitor. There
 * is no gate to render here: the session either permits this route or it does
 * not, and the decision was made by the server that issued the token.
 *
 * The three checks are in this order deliberately:
 *
 *   1. No session at all → the login form, remembering where they were headed.
 *   2. A pending password change outranks the role check. Otherwise an account
 *      still on the password an admin typed for it could reach every page it has
 *      the role for, and the forced change would never happen.
 *   3. Wrong role → the till, not an error page. A worker following a bookmark
 *      to /inventory should land somewhere they can work.
 *
 * @param {{ roles: string[], children: React.ReactNode }} props
 */
const RequireRole = ({ roles, children }) => {
  const session = useAuth();
  const location = useLocation();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (session.user?.must_change_password) {
    return <Navigate to="/change-password" replace />;
  }

  if (!roles.includes(session.user?.role)) {
    return <Navigate to={TILL_ROUTE} replace />;
  }

  return children;
};

export default RequireRole;
