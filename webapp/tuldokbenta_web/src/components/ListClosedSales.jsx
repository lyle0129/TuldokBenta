import React, { useState, useRef } from "react";
import Invoice from "../components/Invoice"; // same component

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
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
    }
  };

  const handlePrint = (sale) => {
    setInvoiceSale(sale);
  
    // Wait for React to render the Invoice first before printing
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
            <body>
              ${printContents}
            </body>
          </html>
        `);
        doc.close();
  
        printWindow.contentWindow.focus();
        printWindow.contentWindow.print();
  
        // cleanup after print
        setTimeout(() => document.body.removeChild(printWindow), 1000);
      }
    }, 200);
  };

  return (
    <div>
      {closedSales.length === 0 ? (
        <p className="text-gray-500">No closed sales yet.</p>
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
                  className="border rounded-lg shadow p-4 flex justify-between items-center"
                >
                  <div>
                    <h3 className="font-semibold">
                      Invoice #{sale.invoice_number}
                    </h3>
                    {/* Add created date */}
                    <p className="text-sm text-gray-500">
                    Created at: {new Date(sale.created_at).toLocaleString()}
                    </p>
                    <p>Total: ${total.toFixed(2)}</p>
                    <p className="text-sm text-gray-500">
                      Paid using: {sale.paid_using}
                    </p>
                    <p className="text-sm text-gray-500">
                      Paid at: {new Date(sale.paid_at).toLocaleString()}
                    </p>

                    <ul className="text-sm text-gray-600 list-disc pl-5 mt-2">
                      {sale.items.map((it, i) => (
                        <li key={i}>
                          {it.type === "service"
                            ? `${it.service_name} x${it.qty || 1}`
                            : `${it.item_name} x${it.qty || 1}`}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-col space-y-2">
                    <button
                      onClick={() => revertSale(sale.id)}
                      className="px-3 py-1 text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Revert Sale
                    </button>

                    <button
                      onClick={() => setDeletingSale(sale)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>

                    <button
                      onClick={() => handlePrint(sale)}
                      className="px-3 py-1 text-green-600 hover:text-green-800 text-sm"
                    >
                      Print Receipt
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex justify-center items-center mt-6 space-x-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i + 1}
                onClick={() => handlePageChange(i + 1)}
                className={`px-3 py-1 rounded ${
                  currentPage === i + 1
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
              >
                {i + 1}
              </button>
            ))}

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingSale && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Confirm Delete
            </h2>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete <strong>Invoice #{deletingSale.invoice_number}</strong>? 
              This action cannot be undone.
            </p>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeletingSale(null)}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
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

      {/* Hidden invoice for printing */}
      <div ref={invoiceRef} style={{ display: "none" }}>
        {invoiceSale && <Invoice sale={invoiceSale} />}
      </div>
    </div>
  );
};

export default ListClosedSales;
