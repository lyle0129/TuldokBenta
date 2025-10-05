import React, { useState, useRef } from "react";
import Invoice from "./Invoice"; // ✅ Make sure you have this component

const ListSales = ({
  openSales,
  deleteOpenSale,
  updateOpenSale,
  paySale,
  loadSales,
  inventory,
  services, 
}) => {
  const [editingSale, setEditingSale] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [payingSale, setPayingSale] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [invoiceSale, setInvoiceSale] = useState(null);
  const [deletingSale, setDeletingSale] = useState(null);

  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [selectedTab, setSelectedTab] = useState("inventory"); 
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");



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

  const handleAddItemToSale = async (sale, item, type) => {
    const newEntry =
      type === "inventory"
        ? { type: "item", item_name: item.item_name, qty: 1, price: item.price }
        : {
            type: "service",
            service_name: item.service_name,
            qty: 1,
            price: item.price,
          };
  
    const updatedItems = [...sale.items, newEntry];
    await updateOpenSale(sale.id, { ...sale, items: updatedItems });
    await loadSales();
  
    // ✅ Show success message
    setSuccessMessage(
      type === "inventory"
        ? `${item.item_name} added successfully!`
        : `${item.service_name} added successfully!`
    );
    setShowSuccessModal(true);
  
    // ✅ Auto close the success modal after 2 seconds
    setTimeout(() => setShowSuccessModal(false), 2000);
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
    <div className="mt-8 px-4 sm:px-6">
      <h2 className="text-2xl font-semibold mb-6 text-gray-800 dark:text-gray-100">
        Saved Open Sales
      </h2>
    
      {openSales.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center italic">
          No open sales yet.
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
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 
                            rounded-xl shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start 
                            sm:justify-between gap-4 hover:shadow-md transition-shadow duration-200"
                >
                  {/* Sale details */}
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                      Invoice #{sale.invoice_number}
                    </h3>

                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      Created at:{" "}
                      <span className="font-medium dark:text-gray-300">
                        {new Date(sale.created_at).toLocaleString()}
                      </span>
                    </p>

                    <p className="text-gray-700 dark:text-gray-200 font-medium mt-1">
                      Total:{" "}
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">
                      ₱{total.toFixed(2)}
                      </span>
                    </p>

                    <ul className="mt-2 text-sm text-gray-600 dark:text-gray-300 list-disc pl-5 space-y-0.5">
                      {sale.items.map((it, i) => (
                        <li key={i}>
                          {it.type === "service"
                            ? `${it.service_name} ×${it.qty || 1}`
                            : `${it.item_name} ×${it.qty || 1}`}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap justify-end gap-2 sm:gap-3">
                    <button
                      onClick={() => {
                        setEditingSale(JSON.parse(JSON.stringify(sale)));
                        setShowModal(true);
                      }}
                      className="px-3 py-1.5 bg-yellow-400 text-white rounded-md text-sm font-medium 
                                hover:bg-yellow-500 transition-colors shadow-sm"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => {
                        setSelectedSale(sale);
                        setShowAddItemModal(true);
                      }}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium 
                                hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      + Add Item
                    </button>

                    <button
                      onClick={() => setDeletingSale(sale)}
                      className="px-3 py-1.5 bg-red-500 text-white rounded-md text-sm font-medium 
                                hover:bg-red-600 transition-colors shadow-sm"
                    >
                      Delete
                    </button>

                    <button
                      onClick={() => setPayingSale(sale)}
                      className="px-3 py-1.5 bg-purple-600 text-white rounded-md text-sm font-medium 
                                hover:bg-purple-700 transition-colors shadow-sm"
                    >
                      Pay
                    </button>

                    <button
                      onClick={() => handlePrint(sale)}
                      className="px-3 py-1.5 border border-green-600 text-green-700 dark:text-green-400 
                                dark:border-green-500 rounded-md text-sm font-medium hover:bg-green-50 
                                dark:hover:bg-green-900/30 transition-colors shadow-sm"
                    >
                      Print Receipt
                    </button>
                  </div>
                </div>
              );
            })}
          </div>



          {/* 🧭 Pagination controls */}
          <div className="flex flex-wrap justify-center items-center mt-6 gap-2">
            {/* Previous Button */}
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 text-sm font-medium rounded-lg 
                        bg-gray-200 dark:bg-gray-700 
                        text-gray-700 dark:text-gray-200 
                        hover:bg-gray-300 dark:hover:bg-gray-600 
                        disabled:opacity-50 disabled:cursor-not-allowed
                        transition-colors"
            >
              Previous
            </button>

            {/* Page Numbers */}
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i + 1}
                onClick={() => handlePageChange(i + 1)}
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors 
                  ${
                    currentPage === i + 1
                      ? "bg-blue-600 text-white dark:bg-blue-500"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`}
              >
                {i + 1}
              </button>
            ))}

            {/* Next Button */}
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 text-sm font-medium rounded-lg 
                        bg-gray-200 dark:bg-gray-700 
                        text-gray-700 dark:text-gray-200 
                        hover:bg-gray-300 dark:hover:bg-gray-600 
                        disabled:opacity-50 disabled:cursor-not-allowed
                        transition-colors"
            >
              Next
            </button>
          </div>
        </>
      )}


      {/* EDIT MODAL */}
      {showModal && editingSale && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-gray-900 border-t-4 border-yellow-500 rounded-2xl shadow-xl w-full max-w-2xl p-6 sm:p-8 transition-all">
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-gray-800 dark:text-gray-100 flex items-center gap-2">
              ✏️ Edit Invoice #{editingSale.invoice_number}
            </h2>

            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
              {editingSale.items.map((it, idx) => (
                <div
                  key={idx}
                  className="border-b border-gray-200 dark:border-gray-700 pb-3"
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                    <div>
                      <p className="font-medium text-gray-800 dark:text-gray-100">
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
                        className="mt-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-md px-2 py-1 w-24 focus:ring-2 focus:ring-yellow-400 outline-none"
                      />
                    </div>
                    <span className="font-semibold text-gray-700 dark:text-gray-100">
                      ₱{(Number(it.price) * Number(it.qty)).toFixed(2)}
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
                            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                              Choose {f.classification} ({freebieSlots} free):
                            </label>

                            {f.choices?.map((choice, cIdx) => (
                              <div
                                key={cIdx}
                                className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 mb-2"
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
                                  className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-2 py-1 rounded-md focus:ring-2 focus:ring-yellow-400 outline-none"
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
                                  className="w-20 mt-2 sm:mt-0 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-md px-2 py-1 focus:ring-2 focus:ring-yellow-400 outline-none"
                                />

                                <button
                                  onClick={() =>
                                    removeModalFreebieChoice(
                                      idx,
                                      f.classification,
                                      cIdx
                                    )
                                  }
                                  className="mt-2 sm:mt-0 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-500 text-sm"
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
                                className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md text-sm transition-colors"
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

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-md text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
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
                className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAY MODAL */}
      {payingSale && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-gray-900 border-t-4 border-purple-500 rounded-2xl shadow-xl w-full max-w-md p-6 sm:p-8 transition-all">
            <h2 className="text-xl sm:text-2xl font-semibold mb-6 text-gray-800 dark:text-gray-100 flex items-center gap-2">
              💳 Pay Invoice #{payingSale.invoice_number}
            </h2>

            <div className="space-y-4">
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-medium">
                Select Payment Method:
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="mt-2 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-purple-400 outline-none transition-colors"
                >
                  <option value="">-- Select Method --</option>
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                </select>
              </label>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                onClick={() => {
                  setPayingSale(null);
                  setPaymentMethod("");
                }}
                className="px-4 py-2 rounded-md text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
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
                className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50 transition-colors"
              >
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingSale && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-gray-900 border-t-4 border-red-600 rounded-2xl shadow-xl w-full max-w-md p-6 sm:p-8 transition-all">
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-red-600 flex items-center gap-2">
              ⚠️ Confirm Delete
            </h2>

            <p className="text-gray-700 dark:text-gray-300 mb-6 leading-relaxed">
              Are you sure you want to delete{" "}
              <strong className="text-gray-900 dark:text-white">
                Invoice #{deletingSale.invoice_number}
              </strong>
              ? This action <span className="font-semibold text-red-500">cannot be undone</span>.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingSale(null)}
                className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={async () => {
                  await deleteOpenSale(deletingSale.id);
                  setDeletingSale(null);
                  loadSales();
                }}
                className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT ADD ITEM MODAL */}
      {showAddItemModal && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 sm:p-8 w-full max-w-3xl transition-all border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Add Items or Services
            </h2>

            {/* Tabs */}
            <div className="flex mb-6 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700">
              <button
                className={`flex-1 py-2 font-medium transition-colors ${
                  selectedTab === "inventory"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
                onClick={() => setSelectedTab("inventory")}
              >
                Inventory
              </button>
              <button
                className={`flex-1 py-2 font-medium transition-colors ${
                  selectedTab === "service"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
                onClick={() => setSelectedTab("service")}
              >
                Services
              </button>
            </div>

            {/* Item/Service Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-96 overflow-y-auto pr-1">
              {selectedTab === "inventory"
                ? inventory.map((item) => (
                    <div
                      key={item.id}
                      className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-all"
                    >
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {item.item_name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {item.item_classification}
                        </p>
                        <p className="font-bold mt-2 text-gray-900 dark:text-gray-100">
                          ₱{item.price}
                        </p>
                        <p
                          className={`text-sm mt-1 ${
                            item.stock === 0
                              ? "text-red-600 font-semibold"
                              : "text-gray-600 dark:text-gray-300"
                          }`}
                        >
                          Stock: {item.stock}
                        </p>
                      </div>

                      <button
                        className="mt-3 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-md transition-colors"
                        onClick={() => handleAddItemToSale(selectedSale, item, "inventory")}
                      >
                        Add
                      </button>
                    </div>
                  ))
                : services.map((service) => (
                    <div
                      key={service.id}
                      className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-all"
                    >
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {service.service_name}
                        </h3>
                        <p className="font-bold mt-2 text-gray-900 dark:text-gray-100">
                          ₱{service.price}
                        </p>
                        {service.freebies?.length > 0 && (
                          <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                            Includes: {service.freebies.join(", ")}
                          </p>
                        )}
                      </div>

                      <button
                        className="mt-3 bg-purple-600 hover:bg-purple-700 text-white py-1.5 rounded-md transition-colors"
                        onClick={() => handleAddItemToSale(selectedSale, service, "service")}
                      >
                        Add
                      </button>
                    </div>
                  ))}
            </div>

            {/* Close Button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowAddItemModal(false)}
                className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ✅ SUCCESS MODAL */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 sm:p-8 w-full max-w-sm text-center border border-gray-200 dark:border-gray-700 transition-all">
            <div className="flex flex-col items-center space-y-3">
              <div className="bg-green-100 dark:bg-green-800 text-green-600 dark:text-green-300 w-12 h-12 flex items-center justify-center rounded-full shadow-inner">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>

              <h2 className="text-lg font-semibold text-green-600 dark:text-green-400">
                Success!
              </h2>
              <p className="text-gray-700 dark:text-gray-300">{successMessage}</p>
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
