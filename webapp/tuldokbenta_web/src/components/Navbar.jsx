// components/Navbar.jsx
import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";

const Navbar = () => {
  const navigate = useNavigate();
  const isAuthenticated = localStorage.getItem("authenticated") === "true";
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("authenticated");
    navigate("/");
    window.location.reload();
  };

  const linkClasses = ({ isActive }) =>
    `block px-4 py-2 rounded-md font-medium transition-colors duration-200 ${
      isActive
        ? "bg-blue-600 text-white"
        : "text-gray-700 hover:bg-blue-50 hover:text-blue-600"
    }`;

  return (
    <nav className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 py-3 flex justify-between items-center">
        {/* Logo */}
        <Link
          to="/"
          className="text-lg sm:text-xl font-bold text-blue-600 tracking-wide"
        >
          TuldokBenta Dashboard
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex gap-2 items-center">
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

          {isAuthenticated && (
            <button
              onClick={handleLogout}
              className="ml-3 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-200"
            >
              Logout
            </button>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2 text-gray-700 hover:text-blue-600 focus:outline-none"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          {/* Simple hamburger icon using spans */}
          <div className="space-y-1">
            <span
              className={`block h-0.5 w-6 bg-current transform transition duration-300 ${
                menuOpen ? "rotate-45 translate-y-1.5" : ""
              }`}
            ></span>
            <span
              className={`block h-0.5 w-6 bg-current transition duration-300 ${
                menuOpen ? "opacity-0" : ""
              }`}
            ></span>
            <span
              className={`block h-0.5 w-6 bg-current transform transition duration-300 ${
                menuOpen ? "-rotate-45 -translate-y-1.5" : ""
              }`}
            ></span>
          </div>
        </button>
      </div>

      {/* Mobile Dropdown Menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white">
          <div className="flex flex-col items-start p-4 space-y-2">
            <NavLink
              to="/open-sales"
              className={linkClasses}
              onClick={() => setMenuOpen(false)}
            >
              Open Sales
            </NavLink>
            <NavLink
              to="/closed-sales"
              className={linkClasses}
              onClick={() => setMenuOpen(false)}
            >
              Closed Sales
            </NavLink>
            <NavLink
              to="/inventory"
              className={linkClasses}
              onClick={() => setMenuOpen(false)}
            >
              Inventory
            </NavLink>
            <NavLink
              to="/services"
              className={linkClasses}
              onClick={() => setMenuOpen(false)}
            >
              Services
            </NavLink>
            <NavLink
              to="/reporting"
              className={linkClasses}
              onClick={() => setMenuOpen(false)}
            >
              Reporting
            </NavLink>

            {isAuthenticated && (
              <button
                onClick={() => {
                  handleLogout();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-200"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
