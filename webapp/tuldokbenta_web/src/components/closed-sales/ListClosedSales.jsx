import React, { useState, useEffect } from "react";
import { printInvoice } from "../../utils/printInvoice";
import Pagination from "../shared/Pagination";
import { isFreebieLine } from "../../utils/buildSaleItems";
import { formatCurrency, formatDateTime, saleTotal } from "../../utils/format";

const SALES_PER_PAGE = 10;

const ListClosedSales = ({
  closedSales,
  revertSale,
  emptyMessage = "No closed sales yet.",
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  // Searching or changing the day can shrink the list past the current page.
  useEffect(() => {
    setCurrentPage(1);
  }, [closedSales]);

  const totalPages = Math.ceil(closedSales.length / SALES_PER_PAGE);
  const indexOfLastSale = currentPage * SALES_PER_PAGE;
  const currentSales = closedSales.slice(
    indexOfLastSale - SALES_PER_PAGE,
    indexOfLastSale
  );

  if (closedSales.length === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400 text-center italic py-8">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="text-gray-800 dark:text-gray-100">
      <div className="space-y-4">
        {currentSales.map((sale) => (
          <div
            key={sale.id}
            className="border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 bg-white dark:bg-gray-800 hover:shadow-md transition"
          >
            <div className="min-w-0">
              <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                Invoice #{sale.invoice_number}
              </h3>

              <p className="text-base font-medium mt-1 text-green-700 dark:text-green-400">
                {formatCurrency(saleTotal(sale))}
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                  via {sale.paid_using}
                </span>
              </p>

              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Paid at: {formatDateTime(sale.paid_at)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Created at: {formatDateTime(sale.created_at)}
              </p>

              <ul className="text-sm text-gray-600 dark:text-gray-300 list-disc pl-5 mt-2 space-y-0.5">
                {sale.items.map((it, i) => (
                  <li key={i} className={isFreebieLine(it) ? "text-green-600 dark:text-green-400" : ""}>
                    {it.type === "service"
                      ? `${it.service_name} ×${it.qty || 1}`
                      : `${it.item_name} ×${it.qty || 1}`}
                    {isFreebieLine(it) && " (free)"}
                  </li>
                ))}
              </ul>
            </div>

            {/* Full-width buttons on a phone; a narrow column from `sm:` up.
                These used to be a fixed column that squeezed the invoice text
                to a sliver on a narrow screen. */}
            <div className="flex sm:flex-col gap-2 text-sm sm:flex-shrink-0">
              <button
                type="button"
                onClick={() => revertSale(sale.id)}
                className="flex-1 sm:flex-none px-4 min-h-11 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded-md border border-yellow-200 dark:border-yellow-700 hover:bg-yellow-200 dark:hover:bg-yellow-800 font-medium transition"
              >
                Revert
              </button>

              {/* NOTE: no Delete here — reverting stock for a sale deleted at
                  this stage isn't handled yet. */}

              <button
                type="button"
                onClick={() => printInvoice(sale)}
                className="flex-1 sm:flex-none px-4 min-h-11 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200 rounded-md border border-purple-200 dark:border-purple-700 hover:bg-purple-200 dark:hover:bg-purple-800 font-medium transition"
              >
                Print
              </button>
            </div>
          </div>
        ))}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={closedSales.length}
        pageSize={SALES_PER_PAGE}
      />
    </div>
  );
};

export default ListClosedSales;
