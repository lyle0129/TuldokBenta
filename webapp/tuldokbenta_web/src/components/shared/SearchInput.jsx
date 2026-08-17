// components/shared/SearchInput.jsx
import { Search, X } from "lucide-react";

/**
 * Controlled search box. `min-h-11` on the field and the clear button keeps
 * both comfortably tappable on a phone, which is where this app lives.
 */
const SearchInput = ({
  value,
  onChange,
  placeholder = "Search…",
  ariaLabel = "Search",
  className = "",
}) => (
  <div className={`relative ${className}`}>
    <Search
      size={18}
      aria-hidden="true"
      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none"
    />
    <input
      type="text"
      inputMode="search"
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-h-11 pl-10 pr-10 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange("")}
        aria-label="Clear search"
        className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <X size={18} />
      </button>
    )}
  </div>
);

export default SearchInput;
