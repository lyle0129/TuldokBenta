import React, { useState, useRef } from "react";
import Invoice from "../shared/Invoice";
import { printInvoice } from "../../utils/printInvoice";
import EditSaleModal from "../sales-modals/EditSaleModal";
import PaySaleModal from "../sales-modals/PaySaleModal";
import DeleteSaleModal from "../sales-modals/DeleteSaleModal";

const ListSales = ({
  openSales,
  deleteOpenSale,
  updateOpenSale,
  paySale,
  loadSales,
  loadInventory,
  inventory,
  services,
}) => {
  const [editingSale, setEditingSale] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [payingSale, setPayingSale] = useState(null);
  const [invoiceSale, setInvoiceSale] = useState(null);
  const [deletingSale, setDeletingSale] = useState(null);

  const [editError, setEditError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
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

  const flashSuccess = (message) => {
    setSuccessMessage(message);
    setShowSuccessModal(true);
    setTimeout(() => setShowSuccessModal(false), 2000);
  };

  /**
   * Stock is deducted server-side, so any sale mutation makes the "Stock:"
   * figures on screen stale. loadSales alone doesn't refresh them — inventory
   * is otherwise only fetched once on mount.
   */
  const refreshAfterMutation = async () => {
    await Promise.all([loadSales?.(), loadInventory?.()]);
  };

  const openEditModal = (sale) => {
    // Deep clone so staged edits can be abandoned with Cancel.
    setEditingSale(JSON.parse(JSON.stringify(sale)));
    setEditError(null);
    setShowModal(true);
  };

  const handleSaveEdit = async (updatedSale) => {
    setIsSaving(true);
    // updateOpenSale reports the server's reason (e.g. "Not enough stock for
    // X"); showing it is the difference between a failed save and a save that
    // silently looks like nothing happened.
    const { ok, message } = await updateOpenSale(updatedSale.id, updatedSale);
    setIsSaving(false);

    if (!ok) {
      setEditError(message);
      return;
    }

    setShowModal(false);
    setEditError(null);
    await loadInventory?.();
    flashSuccess(`Invoice #${updatedSale.invoice_number} updated.`);
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
                    {/* Adding, removing and re-quantifying all happen inside
                        the edit modal now, so they commit as one update. */}
                    <button
                      onClick={() => openEditModal(sale)}
                      className="px-3 py-1.5 bg-yellow-400 text-white rounded-md text-sm font-medium
                                hover:bg-yellow-500 transition-colors shadow-sm"
                    >
                      Edit
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
                      onClick={() => printInvoice(sale)}
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
          <div className="flex flex-col sm:flex-row justify-center items-center mt-6 gap-3 sm:gap-4">
            {/* Previous Button */}
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 text-sm font-medium rounded-lg 
                        bg-gray-200 dark:bg-gray-700 
                        text-gray-700 dark:text-gray-200 
                        hover:bg-gray-300 dark:hover:bg-gray-600 
                        disabled:opacity-50 disabled:cursor-not-allowed
                        transition-colors min-w-[80px]"
            >
              Previous
            </button>

            {/* Page Numbers (Scrollable on Mobile) */}
            <div
              className="flex overflow-x-auto sm:overflow-visible max-w-full sm:max-w-none 
                        scrollbar-hide gap-2 px-2 py-1 rounded-lg 
                        bg-gray-100 dark:bg-gray-800 sm:bg-transparent sm:dark:bg-transparent"
            >
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i + 1}
                  onClick={() => handlePageChange(i + 1)}
                  className={`px-3 py-2 text-sm font-semibold rounded-lg flex-shrink-0 transition-colors
                    ${
                      currentPage === i + 1
                        ? "bg-blue-600 text-white dark:bg-blue-500"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            {/* Next Button */}
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 text-sm font-medium rounded-lg 
                        bg-gray-200 dark:bg-gray-700 
                        text-gray-700 dark:text-gray-200 
                        hover:bg-gray-300 dark:hover:bg-gray-600 
                        disabled:opacity-50 disabled:cursor-not-allowed
                        transition-colors min-w-[80px]"
            >
              Next
            </button>
          </div>
        </>
      )}

      {/* Edit Modal */}
      <EditSaleModal
        sale={showModal ? editingSale : null}
        onClose={() => {
          setShowModal(false);
          setEditError(null);
        }}
        onSave={handleSaveEdit}
        onUpdate={(updater) => {
          // Any further edit invalidates the last failure message.
          setEditError(null);
          setEditingSale(updater);
        }}
        inventory={inventory}
        services={services}
        errorMessage={editError}
        isSaving={isSaving}
      />

      {/* Pay Modal */}
      <PaySaleModal
        sale={payingSale}
        onClose={() => setPayingSale(null)}
        onConfirm={async (method) => {
          await paySale(payingSale.id, method);
          setPayingSale(null);
          await refreshAfterMutation();
        }}
      />

      {/* Delete Modal */}
      <DeleteSaleModal
        sale={deletingSale}
        onClose={() => setDeletingSale(null)}
        onConfirm={async () => {
          await deleteOpenSale(deletingSale.id);
          setDeletingSale(null);
          await refreshAfterMutation();
        }}
      />

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
