import React, { useState, useRef } from "react";
import Invoice from "../components/Invoice";

const ListClosedSales = ({ closedSales, revertSale, deleteClosedSale, loadSales }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [invoiceSale, setInvoiceSale] = useState(null);
  const [deletingSale, setDeletingSale] = useState(null);
  const salesPerPage = 10;
  const invoiceRef = useRef();

  const indexOfLastSale = currentPage * salesPerPage;
  const indexOfFirstSale = indexOfLastSale - salesPerPage;
  const currentSales = closedSales.slice(indexOfFirstSale, indexOfLastSale);
  const totalPages = Math.ceil(closedSales.length / salesPerPage);

  const handlePageChange = (pageNumber) => {
    if (pageNumber >= 1 && pageNumber <= totalPages) setCurrentPage(pageNumber);
  };

  const handlePrint = (sale) => {
    setInvoiceSale(sale);
    setTimeout(() => {
      if (invoiceRef.current) {
        const printContents = invoiceRef.current.innerHTML;
        const printWindow = document.createElement("iframe");
        printWindow.style.position = "fixed";
        printWindow.style.right = "0";
        printWindow.style.bottom = "0";
        printWindow.style.width = "0";
        printWindow.style.height = "0";
        printWindow.style.border = "0";
        document.body.appendChild(printWindow);

        const doc = printWindow.contentWindow.document;
        doc.open();
        doc.write(`
          <html>
            <head>
              <title>Receipt - ${sale.invoice_number}</title>
              <style>
                @media print {
                  body {
                    font-family: "Courier New", monospace;
                    font-size: 12px;
                    width: 58mm;
                    margin: 0;
                    padding: 0;
                  }
                  .receipt {
                    width: 100%;
                    padding: 10px;
                  }
                  .receipt-header {
                    text-align: center;
                    font-weight: bold;
                    margin-bottom: 10px;
                  }
                  .receipt-item {
                    display: flex;
                    justify-content: space-between;
                  }
                  .receipt-total {
                    border-top: 1px dashed #000;
                    margin-top: 10px;
                    padding-top: 5px;
                    text-align: right;
                    font-weight: bold;
                  }
                }
              </style>
            </head>
            <body>${printContents}</body>
          </html>
        `);
        doc.close();
        printWindow.contentWindow.focus();
        printWindow.contentWindow.print();
        setTimeout(() => document.body.removeChild(printWindow), 1000);
      }
    }, 200);
  };

  return (
    <div className="text-gray-800 dark:text-gray-100">
      {closedSales.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center italic">
          No closed sales yet.
        </p>
      ) : (
        <>
          <div className="space-y-4">
            {currentSales.map((sale) => {
              const total = sale.items.reduce(
                (sum, it) => sum + Number(it.price) * (it.qty || 1),
                0
              );

              return (
                <div
                  key={sale.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-5 flex justify-between items-start bg-white dark:bg-gray-800 hover:shadow-md transition"
                >
                  <div>
                    <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                      Invoice #{sale.invoice_number}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Created at: {new Date(sale.created_at).toLocaleString()}
                    </p>
                    <p className="text-base font-medium mt-1">
                      Total: ${total.toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Paid using: {sale.paid_using}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Paid at: {new Date(sale.paid_at).toLocaleString()}
                    </p>

                    <ul className="text-sm text-gray-600 dark:text-gray-300 list-disc pl-5 mt-2">
                      {sale.items.map((it, i) => (
                        <li key={i}>
                          {it.type === "service"
                            ? `${it.service_name} x${it.qty || 1}`
                            : `${it.item_name} x${it.qty || 1}`}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-col space-y-2 text-sm">
                    <button
                      onClick={() => revertSale(sale.id)}
                      className="px-3 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded-md border border-yellow-200 dark:border-yellow-700 hover:bg-yellow-200 dark:hover:bg-yellow-800 transition"
                    >
                      Revert
                    </button>

                    <button
                      onClick={() => setDeletingSale(sale)}
                      className="px-3 py-1 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 rounded-md border border-red-200 dark:border-red-700 hover:bg-red-200 dark:hover:bg-red-800 transition"
                    >
                      Delete
                    </button>

                    <button
                      onClick={() => handlePrint(sale)}
                      className="px-3 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200 rounded-md border border-purple-200 dark:border-purple-700 hover:bg-purple-200 dark:hover:bg-purple-800 transition"
                    >
                      Print
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex justify-center items-center mt-8 space-x-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1 rounded-md bg-gray-200 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i + 1}
                onClick={() => handlePageChange(i + 1)}
                className={`px-3 py-1 rounded-md ${
                  currentPage === i + 1
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                {i + 1}
              </button>
            ))}

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 rounded-md bg-gray-200 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deletingSale && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold mb-4 text-red-600 dark:text-red-400">
              Confirm Delete
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Are you sure you want to delete{" "}
              <strong>Invoice #{deletingSale.invoice_number}</strong>?<br />
              This action cannot be undone.
            </p>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeletingSale(null)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await deleteClosedSale(deletingSale.id);
                  setDeletingSale(null);
                  loadSales();
                }}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Invoice for Printing */}
      <div ref={invoiceRef} style={{ display: "none" }}>
        {invoiceSale && <Invoice sale={invoiceSale} />}
      </div>
    </div>
  );
};

export default ListClosedSales;
