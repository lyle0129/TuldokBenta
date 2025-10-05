import React from "react";

export default function SalesList({
  title,
  sales,
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
  formatDate,
  formatCurrency,
  itemsPerPage = 5,
}) {
  const paginate = (data, page) => {
    const start = (page - 1) * itemsPerPage;
    return data.slice(start, start + itemsPerPage);
  };

  return (
    <section>
      <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">
        {title} ({sales.length})
      </h2>

      {sales.length === 0 ? (
        <p className="font-semibold text-gray-900 dark:text-gray-100">
          No {title.toLowerCase()} in this range.
        </p>
      ) : (
        <>
          {paginate(sales, currentPage).map((sale) => (
            <div key={sale.id} className="border p-3 rounded mb-2 bg-gray-50 dark:bg-gray-800">
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                Invoice #{sale.invoice_number}
              </p>
              <p className="text-gray-700 dark:text-gray-300">Created: {formatDate(sale.created_at)}</p>
              {sale.paid_at && (
                <p className="text-gray-700 dark:text-gray-300">Paid: {formatDate(sale.paid_at)}</p>
              )}
              <p className="text-gray-900 dark:text-gray-100">
                Total: {formatCurrency(sale.items.reduce((sum, i) => sum + i.price * (i.qty || 1), 0))}
              </p>
              <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300">
                {sale.items
                  .map(it => it.type === "service" ? `${it.service_name} x${it.qty || 1}` : `${it.item_name} x${it.qty || 1}`)
                  .map((line, idx) => <li key={idx}>{line}</li>)}
              </ul>
            </div>
          ))}

          {/* Pagination */}
          <div className="flex justify-between mt-2 text-gray-900 dark:text-gray-100">
            <button
              disabled={currentPage === 1}
              onClick={onPrevPage}
              className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button
              disabled={currentPage === totalPages}
              onClick={onNextPage}
              className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
