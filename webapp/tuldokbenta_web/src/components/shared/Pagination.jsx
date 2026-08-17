// components/shared/Pagination.jsx
import { pageWindow } from "../../utils/pageWindow";

/** Shared pager for the sale lists. Replaces two near-identical hand-rolled ones. */
const Pagination = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems = null,
  pageSize = null,
}) => {
  if (totalPages <= 1) return null;

  const go = (page) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) onPageChange(page);
  };

  const arrowClass =
    "px-3 py-2 min-h-11 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

  const showingFrom = pageSize ? (currentPage - 1) * pageSize + 1 : null;
  const showingTo =
    pageSize && totalItems ? Math.min(currentPage * pageSize, totalItems) : null;

  return (
    <nav aria-label="Pagination" className="mt-6 flex flex-col items-center gap-3">
      {totalItems != null && showingFrom != null && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Showing {showingFrom}–{showingTo} of {totalItems}
        </p>
      )}

      <div className="flex items-center gap-2 w-full justify-center">
        <button
          type="button"
          onClick={() => go(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
          className={arrowClass}
        >
          ‹
        </button>

        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-1">
          {pageWindow(currentPage, totalPages).map((page, i) =>
            page === "…" ? (
              <span
                key={`gap-${i}`}
                aria-hidden="true"
                className="px-1 py-2 text-sm text-gray-400 dark:text-gray-500 select-none"
              >
                …
              </span>
            ) : (
              <button
                key={page}
                type="button"
                onClick={() => go(page)}
                aria-label={`Page ${page}`}
                aria-current={currentPage === page ? "page" : undefined}
                className={`flex-shrink-0 min-w-11 min-h-11 px-3 rounded-md text-sm font-medium transition-colors ${
                  currentPage === page
                    ? "bg-blue-600 text-white dark:bg-blue-500"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                {page}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          onClick={() => go(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Next page"
          className={arrowClass}
        >
          ›
        </button>
      </div>
    </nav>
  );
};

export default Pagination;
