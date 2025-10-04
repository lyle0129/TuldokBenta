// components/Navbar.js
import { Link, NavLink } from "react-router-dom";

const Navbar = () => {
  const linkClasses = ({ isActive }) =>
    `px-4 py-2 rounded-md font-medium transition ${
      isActive ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-200"
    }`;

  return (
    <nav className="bg-white shadow-md">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
        <Link to="/" className="text-xl font-bold text-blue-600">
          TuldokBenta Dashboard
        </Link>
        <div className="flex gap-4">
          <NavLink to="/open-sales" className={linkClasses}>
            Open Sales
          </NavLink>
          <NavLink to="/closed-sales" className={linkClasses}>
            Closed Sales
          </NavLink>
          <NavLink to="/inventory" className={linkClasses}>
            Inventory
          </NavLink>
          <NavLink to="/services" className={linkClasses}>
            Services
          </NavLink>
          <NavLink to="/reporting" className={linkClasses}>
            Reporting
          </NavLink>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;