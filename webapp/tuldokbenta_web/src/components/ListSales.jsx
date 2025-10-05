import React, { useState, useRef } from "react";
import Invoice from "./Invoice"; // ✅ Make sure you have this component

const ListSales = ({
  openSales,
  deleteOpenSale,
  updateOpenSale,
  paySale,
  loadSales,
  inventory,
}) => {
  const [editingSale, setEditingSale] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [payingSale, setPayingSale] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [invoiceSale, setInvoiceSale] = useState(null);
  const [deletingSale, setDeletingSale] = useState(null);

    // 🧭 Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const salesPerPage = 10;
  
    const invoiceRef = useRef();
  
    // 🧮 Pagination logic
    const indexOfLastSale = currentPage * salesPerPage;
    const indexOfFirstSale = indexOfLastSale - salesPerPage;
    const currentSales = openSales.slice(indexOfFirstSale, indexOfLastSale);
    const totalPages = Math.ceil(openSales.length / salesPerPage);
  
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
  
  
  // 🧮 Freebie update helpers
  const updateModalFreebieChoice = (idx, classification, cIdx, value) => {
    setEditingSale((prev) => {
      const updated = { ...prev };
      const freebies = updated.items[idx].freebies;
      const fIndex = freebies.findIndex((f) => f.classification === classification);
      if (fIndex >= 0) freebies[fIndex].choices[cIdx].item = value;
      return updated;
    });
  };

  const updateModalFreebieQuantity = (idx, classification, cIdx, value) => {
    setEditingSale((prev) => {
      const updated = { ...prev };
      const freebies = updated.items[idx].freebies;
      const fIndex = freebies.findIndex((f) => f.classification === classification);
      if (fIndex >= 0) freebies[fIndex].choices[cIdx].qty = value;
      return updated;
    });
  };

  const addModalFreebieChoice = (idx, classification) => {
    setEditingSale((prev) => {
      const updated = { ...prev };
      const freebies = updated.items[idx].freebies;
      const fIndex = freebies.findIndex((f) => f.classification === classification);
      if (fIndex >= 0) freebies[fIndex].choices.push({ item: "", qty: 1 });
      return updated;
    });
  };

  const removeModalFreebieChoice = (idx, classification, cIdx) => {
    setEditingSale((prev) => {
      const updated = { ...prev };
      const freebies = updated.items[idx].freebies;
      const fIndex = freebies.findIndex((f) => f.classification === classification);
      if (fIndex >= 0) freebies[fIndex].choices.splice(cIdx, 1);
      return updated;
    });
  };

  // 🧾 Render
  return (
    <div className="mt-10">
      <h2 className="text-2xl font-semibold mb-4">Saved Open Sales</h2>

      {openSales.length === 0 ? (
        <p className="text-gray-500">No open sales yet.</p>
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
                    <h3 className="font-semibold">Invoice #{sale.invoice_number}</h3>

                    {/* Add created date */}
                    <p className="text-sm text-gray-500">
                      Created at: {new Date(sale.created_at).toLocaleString()}
                    </p>
                    <p>Total: ${total.toFixed(2)}</p>

                    <ul className="text-sm text-gray-600 list-disc pl-5">
                      {sale.items.map((it, i) => (
                        <li key={i}>
                          {it.type === "service"
                            ? `${it.service_name} x${it.qty || 1}`
                            : `${it.item_name} x${it.qty || 1}`}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        setEditingSale(JSON.parse(JSON.stringify(sale)));
                        setShowModal(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => setDeletingSale(sale)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>

                    <button
                      onClick={() => setPayingSale(sale)}
                      className="text-purple-600 hover:text-purple-800 text-sm"
                    >
                      Pay
                    </button>

                    <button
                      onClick={() => handlePrint(sale)}
                      className="text-green-600 hover:text-green-800 text-sm"
                    >
                      Print Receipt
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 🧭 Pagination controls */}
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


      {/* EDIT MODAL */}
      {showModal && editingSale && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-6">
            <h2 className="text-xl font-semibold mb-4">
              Edit Invoice #{editingSale.invoice_number}
            </h2>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {editingSale.items.map((it, idx) => (
                <div key={idx} className="border-b pb-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">
                        {it.type === "service" ? it.service_name : it.item_name}
                      </p>
                      <input
                        type="number"
                        min="1"
                        value={it.qty}
                        onChange={(e) => {
                          const newQty = Number(e.target.value);
                          setEditingSale((prev) => {
                            const updated = { ...prev };
                            updated.items[idx].qty = newQty;
                            return updated;
                          });
                        }}
                        className="mt-1 border rounded px-2 py-1 w-20"
                      />
                    </div>
                    <span className="font-semibold">
                      ${(Number(it.price) * Number(it.qty)).toFixed(2)}
                    </span>
                  </div>

                  {/* Freebie editor */}
                  {it.type === "service" && it.freebies?.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {it.freebies.map((f, fIdx) => {
                        const freebieSlots = it.qty;
                        const totalUsed =
                          f.choices?.reduce((sum, c) => sum + c.qty, 0) || 0;
                        const remaining = freebieSlots - totalUsed;

                        return (
                          <div key={fIdx}>
                            <label className="block text-sm text-gray-600 mb-1">
                              Choose {f.classification} ({freebieSlots} free):
                            </label>

                            {f.choices?.map((choice, cIdx) => (
                              <div
                                key={cIdx}
                                className="flex items-center space-x-2 mb-2"
                              >
                                <select
                                  value={choice.item || ""}
                                  onChange={(e) =>
                                    updateModalFreebieChoice(
                                      idx,
                                      f.classification,
                                      cIdx,
                                      e.target.value
                                    )
                                  }
                                  className="flex-1 border px-2 py-1 rounded-md"
                                >
                                  <option value="">-- Select --</option>
                                  {inventory
                                    .filter(
                                      (inv) =>
                                        inv.item_classification === f.classification
                                    )
                                    .map((inv) => (
                                      <option key={inv._id} value={inv.item_name}>
                                        {inv.item_name}
                                      </option>
                                    ))}
                                </select>

                                <input
                                  type="number"
                                  min="1"
                                  max={freebieSlots}
                                  value={choice.qty}
                                  onChange={(e) =>
                                    updateModalFreebieQuantity(
                                      idx,
                                      f.classification,
                                      cIdx,
                                      Number(e.target.value)
                                    )
                                  }
                                  className="w-16 border px-2 py-1 rounded-md"
                                />

                                <button
                                  onClick={() =>
                                    removeModalFreebieChoice(
                                      idx,
                                      f.classification,
                                      cIdx
                                    )
                                  }
                                  className="text-red-600 hover:text-red-800 text-sm"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}

                            {remaining > 0 && (
                              <button
                                onClick={() =>
                                  addModalFreebieChoice(idx, f.classification)
                                }
                                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                              >
                                + Add {f.classification}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const success = await updateOpenSale(editingSale.id, editingSale);
                  if (success) {
                    setShowModal(false);
                    loadSales();
                  }
                }}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAY MODAL */}
      {payingSale && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h2 className="text-xl font-semibold mb-4">
              Pay Invoice #{payingSale.invoice_number}
            </h2>

            <div className="space-y-4">
              <label className="block">
                <span className="text-gray-700">Select Payment Method:</span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="mt-1 block w-full border rounded px-3 py-2"
                >
                  <option value="">-- Select Method --</option>
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                </select>
              </label>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setPayingSale(null);
                  setPaymentMethod("");
                }}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                disabled={!paymentMethod}
                onClick={async () => {
                  await paySale(payingSale.id, paymentMethod);
                  setPayingSale(null);
                  setPaymentMethod("");
                  loadSales();
                }}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
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
                  await deleteOpenSale(deletingSale.id);
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


      {/* HIDDEN PRINTABLE INVOICE */}
      <div ref={invoiceRef} style={{ display: "none" }}>
        {invoiceSale && <Invoice sale={invoiceSale} />}
      </div>

    </div>
  );
};

export default ListSales;
