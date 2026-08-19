// components/reporting/ReportSalesList.jsx
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import Pagination from "../shared/Pagination";
import { usePaymentMethods } from "../../hooks/usePaymentMethods";
import { buildMethodLookup, resolveMethod } from "../../utils/paymentMethods";
import { formatCurrency, formatDateTime, saleTotal } from "../../utils/format";

/**
 * A sortable, paged list of sales for the report.
 *
 * Rebuilt on the shared UI: the pager is the app's Pagination, the formatters
 * are imported rather than passed down as props (the old list took them as
 * arguments, which is how one page ended up printing "$"), and money goes
 * through saleTotal so string prices from Postgres NUMERIC can't concatenate.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {object[]} props.sales
 * @param {boolean} [props.showPayment] show the paid date and method
 * @param {number} [props.pageSize]
 * @param {string} props.emptyMessage
 */
const SORT_FIELDS = [
  { id: "created_at", label: "Created" },
  { id: "paid_at", label: "Paid", paymentOnly: true },
  { id: "total", label: "Amount" },
  { id: "invoice_number", label: "Invoice" },
];

const ReportSalesList = ({
  title,
  sales = [],
  showPayment = false,
  pageSize = 10,
  emptyMessage = "No sales to show.",
}) => {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState(showPayment ? "paid_at" : "created_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [expanded, setExpanded] = useState(() => new Set());

  const { paymentMethods } = usePaymentMethods();
  const methodLookup = useMemo(
    () => buildMethodLookup(paymentMethods),
    [paymentMethods]
  );

  const sorted = useMemo(() => {
    const withTotals = sales.map((sale) => ({ ...sale, total: saleTotal(sale) }));
    const direction = sortOrder === "asc" ? 1 : -1;

    const key = (sale) => {
      switch (sortBy) {
        case "paid_at":
          return sale.paid_at ? new Date(sale.paid_at).getTime() : 0;
        case "total":
          return sale.total;
        case "invoice_number":
          return sale.invoice_number ?? "";
        case "created_at":
        default:
          return new Date(sale.created_at).getTime();
      }
    };

    return withTotals.sort((a, b) => {
      const av = key(a);
      const bv = key(b);
      if (av === bv) return 0;
      return av > bv ? direction : -direction;
    });
  }, [sales, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));

  // Narrowing the filter used to leave the pager on a page that no longer
  // exists, which rendered as an empty list rather than as no matches.
  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const start = (page - 1) * pageSize;
  const visible = sorted.slice(start, start + pageSize);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const toggle = (id) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sortIcon = (field) => {
    if (sortBy !== field) return <ChevronsUpDown size={14} aria-hidden="true" />;
    return sortOrder === "asc" ? (
      <ChevronUp size={14} aria-hidden="true" />
    ) : (
      <ChevronDown size={14} aria-hidden="true" />
    );
  };

  const total = sorted.reduce((sum, sale) => sum + sale.total, 0);

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          {title}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 sm:ml-auto">
          <span className="font-semibold text-gray-800 dark:text-gray-100">
            {sorted.length} {sorted.length === 1 ? "sale" : "sales"}
          </span>{" "}
          ·{" "}
          <span className="font-semibold text-green-700 dark:text-green-400">
            {formatCurrency(total)}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm text-gray-600 dark:text-gray-400">Sort by</span>
        {SORT_FIELDS.filter((f) => showPayment || !f.paymentOnly).map((field) => (
          <button
            key={field.id}
            type="button"
            onClick={() => handleSort(field.id)}
            aria-pressed={sortBy === field.id}
            className={`flex items-center gap-1.5 px-3 min-h-11 rounded-md border text-sm font-medium transition-colors ${
              sortBy === field.id
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            {field.label}
            {sortIcon(field.id)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center italic py-8">
          {emptyMessage}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((sale) => {
            const isOpen = expanded.has(sale.id);
            return (
              <li
                key={sale.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-4 bg-white dark:bg-gray-800 hover:shadow-md transition"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3 className="font-semibold text-gray-800 dark:text-gray-100">
                        {sale.invoice_number}
                      </h3>
                      <span className="font-bold text-green-700 dark:text-green-400">
                        {formatCurrency(sale.total)}
                      </span>
                      {showPayment && sale.paid_using && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-700">
                          {resolveMethod(methodLookup, sale.paid_using).label}
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Created {formatDateTime(sale.created_at)}
                      {showPayment && sale.paid_at && (
                        <> · Paid {formatDateTime(sale.paid_at)}</>
                      )}
                    </p>

                    {!isOpen && (
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 truncate">
                        {(sale.items || [])
                          .map((item) =>
                            item.type === "service"
                              ? item.service_name
                              : item.item_name
                          )
                          .join(", ")}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => toggle(sale.id)}
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? "Hide" : "Show"} lines for ${sale.invoice_number}`}
                    className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>

                {isOpen && (
                  <ul className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-1">
                    {(sale.items || []).map((item, index) => (
                      <li
                        key={index}
                        className="flex justify-between items-center gap-3 text-sm text-gray-700 dark:text-gray-300"
                      >
                        <span className="min-w-0 truncate">
                          {item.type === "service"
                            ? item.service_name
                            : item.item_name}
                          <span className="text-gray-500 dark:text-gray-400">
                            {" "}
                            ×{item.qty || 1}
                          </span>
                        </span>
                        <span className="font-medium flex-shrink-0">
                          {formatCurrency(
                            Number(item.price || 0) * Number(item.qty || 1)
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={sorted.length}
        pageSize={pageSize}
      />
    </div>
  );
};

export default ReportSalesList;
