import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import Navbar from "./components/shared/Navbar";
import Inventory from "./pages/Inventory";
import Services from "./pages/Services";
import PaymentMethods from "./pages/PaymentMethods";
import OpenSales from "./pages/OpenSales";
import ClosedSales from "./pages/ClosedSales";
import Reporting from "./pages/Reporting";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import SelectShop from "./pages/SelectShop";
import AdminShops from "./pages/AdminShops";
import AdminUsers from "./pages/AdminUsers";
import AdminAudit from "./pages/AdminAudit";
import RequireRole from "./components/shared/RequireRole";
import { rolesForPath } from "./components/shared/navItems";
import Footer from "./components/shared/Footer";
import OpenSalesOffline from "./pages/OpenSalesOffline";

/**
 * The nav shell every signed-in page renders inside.
 *
 * A layout route rather than a Navbar mounted above <Routes>, because /login and
 * /change-password must render without it: a signed-out user has no navigation
 * to show, and a forced password change should not offer links away from itself.
 */
const AppShell = () => (
  <>
    <Navbar />
    <main className="px-4 sm:px-6 md:px-8 py-4 sm:py-6">
      <Outlet />
    </main>
  </>
);

/**
 * One guarded page.
 *
 * The permitted roles come from `rolesForPath` rather than being written out
 * here. The old ProtectedRoute wrapping was a second list that mirrored
 * navItems' `adminOnly` flags by hand, and the two could disagree about what was
 * protected — the nav hiding a link the route still served, or the reverse. With
 * one lookup there is nothing to keep in step.
 */
const guarded = (path, element) => (
  <Route
    key={path}
    path={path}
    element={<RequireRole roles={rolesForPath(path)}>{element}</RequireRole>}
  />
);

function App() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/change-password" element={<ChangePassword />} />
          {/* Outside the shell for the same reason as the two above: it is
              where a user with no shop lands, and every link in the nav leads
              to a page that would send them straight back. */}
          <Route path="/select-shop" element={<SelectShop />} />

          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/open-sales" replace />} />
            {guarded("/open-sales", <OpenSales />)}
            {guarded("/open-sales-offline", <OpenSalesOffline />)}
            {guarded("/closed-sales", <ClosedSales />)}
            {guarded("/inventory", <Inventory />)}
            {guarded("/services", <Services />)}
            {guarded("/payment-methods", <PaymentMethods />)}
            {guarded("/reporting", <Reporting />)}

            {/* The console. Guarded by the same rolesForPath lookup as every
                route above — the Admin group in navItems.js is what makes
                these super-admin-only, on both the nav and the router. */}
            {guarded("/admin/shops", <AdminShops />)}
            {guarded("/admin/users", <AdminUsers />)}
            {guarded("/admin/audit", <AdminAudit />)}
          </Route>
        </Routes>
      </Router>
      <Footer />
    </div>
  );
}

export default App;
