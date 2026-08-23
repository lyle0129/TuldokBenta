// pages/SelectShop.jsx
import { Navigate } from "react-router-dom";
import { Store } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useActiveShop, setShop } from "../hooks/useActiveShop";
import AuthCard from "../components/shared/AuthCard";
import { navRowClass } from "../components/shared/navItems";

const TILL_ROUTE = "/open-sales";

/**
 * The landing for a signed-in user who has no shop selected.
 *
 * Rendered outside the nav shell, like Login and ChangePassword. The nav is a
 * list of shop-scoped pages, every one of which would bounce straight back here
 * — offering links that cannot be followed is worse than offering none.
 *
 * Two branches, and the second is the one worth building properly:
 *
 *   1. Several shops and no valid stored selection → choose one.
 *   2. No shops at all → say so. This is a real state, not an error: an account
 *      can legitimately exist for a day before anyone assigns it (the API
 *      returns `[]` for it deliberately). Without this branch such a user lands
 *      on a till with an empty catalog, an empty sales list and no explanation,
 *      which reads as the app being broken rather than as a missing assignment.
 */
const SelectShop = () => {
  const session = useAuth();
  const { shopId, shops } = useActiveShop();

  if (!session) return <Navigate to="/login" replace />;

  // A forced password change outranks choosing a shop, matching RequireRole's
  // ordering — otherwise an account still on the password an admin typed for it
  // could pick a shop and start working.
  if (session.user?.must_change_password) {
    return <Navigate to="/change-password" replace />;
  }

  // Arriving here with a shop already resolved means useActiveShop auto-selected
  // the single assignment, or the user came back to a stale URL. Either way
  // there is nothing to choose.
  if (shopId) return <Navigate to={TILL_ROUTE} replace />;

  if (shops.length === 0) {
    return (
      <AuthCard
        title="No shop assigned"
        subtitle={`Signed in as ${session.user?.full_name || session.user?.username}.`}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Your account is not assigned to any shop yet, so there is nothing to
          sell from. Ask your administrator to assign you to one, then sign in
          again.
        </p>
      </AuthCard>
    );
  }

  // No navigate() here: selecting notifies the session store, which re-renders
  // this page with a shop resolved, and the guard above sends them to the till.
  // Doing both would queue two navigations to the same route.
  return (
    <AuthCard
      title="Choose a shop"
      subtitle="Everything you do next applies to the shop you pick here."
    >
      <div className="space-y-2">
        {shops.map((shop) => (
          <button
            key={shop.id}
            type="button"
            onClick={() => setShop(shop.id)}
            className={`${navRowClass(false)} w-full text-left`}
          >
            <Store size={18} aria-hidden="true" className="flex-shrink-0" />
            {shop.name}
          </button>
        ))}
      </div>
    </AuthCard>
  );
};

export default SelectShop;
