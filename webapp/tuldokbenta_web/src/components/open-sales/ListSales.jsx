import React, { useState, useMemo, useEffect } from "react";
import { printInvoice } from "../../utils/printInvoice";
import EditSaleModal from "../sales-modals/EditSaleModal";
import PaySaleModal from "../sales-modals/PaySaleModal";
import DeleteSaleModal from "../sales-modals/DeleteSaleModal";
import SearchInput from "../shared/SearchInput";
import Pagination from "../shared/Pagination";
import { filterSales } from "../../utils/filterSales";
import { isFreeLine } from "../../utils/buildSaleItems";
import { formatCurrency, formatDateTime, saleTotal } from "../../utils/format";
import {
  saleCardClass,
  saleActionsClass,
  rowActionClass,
  rowActionAccents,
} from "../shared/fieldStyles";

const ListSales = ({
  openSales,
  deleteOpenSale,
  updateOpenSale,
  paySale,
  inventory,
  services,
}) => {
  // Being non-null *is* the open state; the modal deep-clones it into its own
  // draft, so this stays the untouched row straight out of the list.
  const [editingSale, setEditingSale] = useState(null);
  const [payingSale, setPayingSale] = useState(null);
  const [deletingSale, setDeletingSale] = useState(null);

  const [editError, setEditError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const salesPerPage = 10;

  const visibleSales = useMemo(
    () => filterSales(openSales, query),
    [openSales, query]
  );

  // Narrowing the list can strand the viewer on a page that no longer exists.
  useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  const totalPages = Math.ceil(visibleSales.length / salesPerPage);
  const indexOfLastSale = currentPage * salesPerPage;
  const currentSales = visibleSales.slice(
    indexOfLastSale - salesPerPage,
    indexOfLastSale
  );

  const flashSuccess = (message) => {
    setSuccessMessage(message);
    setShowSuccessModal(true);
    setTimeout(() => setShowSuccessModal(false), 2000);
  };

  const openEditModal = (sale) => {
    setEditingSale(sale);
    setEditError(null);
  };

  const closeEditModal = () => {
    setEditingSale(null);
    setEditError(null);
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

    closeEditModal();
    flashSuccess(`Invoice #${updatedSale.invoice_number} updated.`);
  };

  // 🧾 Render
  return (
    <div className="mt-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-800 dark:text-gray-100">
          Saved Open Sales
        </h2>
        {openSales.length > 0 && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search invoice, customer, or item…"
            ariaLabel="Search open sales"
            className="w-full sm:w-72"
          />
        )}
      </div>

      {visibleSales.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center italic py-8">
          {openSales.length === 0
            ? "No open sales yet."
            : `No open sales match “${query}”.`}
        </p>
      ) : (
        <>
          <div className="space-y-4">
            {currentSales.map((sale) => {
              const total = saleTotal(sale);

              return (
                <div key={sale.id} className={saleCardClass}>
                  {/* Sale details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                      Invoice #{sale.invoice_number}
                    </h3>

                    {sale.customer_name && (
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-0.5">
                        {sale.customer_name}
                      </p>
                    )}

                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      Created at:{" "}
                      <span className="font-medium dark:text-gray-300">
                        {formatDateTime(sale.created_at)}
                      </span>
                    </p>

                    <p className="text-gray-700 dark:text-gray-200 font-medium mt-1">
                      Total:{" "}
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">
                        {formatCurrency(total)}
                      </span>
                    </p>

                    {/* Freebie lines are marked rather than folded away, the
                        same as the closed-sales list: a price-0 line is still
                        stock leaving the shelf, and a cashier checking the
                        order needs to see it. */}
                    <ul className="mt-2 text-sm text-gray-600 dark:text-gray-300 list-disc pl-5 space-y-0.5">
                      {sale.items.map((it, i) => (
                        <li
                          key={i}
                          className={
                            isFreeLine(it)
                              ? "text-green-600 dark:text-green-400"
                              : ""
                          }
                        >
                          {it.type === "service"
                            ? `${it.service_name} ×${it.qty || 1}`
                            : `${it.item_name} ×${it.qty || 1}`}
                          {isFreeLine(it) && " (free)"}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Action buttons */}
                  <div className={saleActionsClass}>
                    {/* Adding, removing and re-quantifying all happen inside
                        the edit modal now, so they commit as one update. */}
                    <button
                      type="button"
                      onClick={() => openEditModal(sale)}
                      className={rowActionClass(rowActionAccents.blue)}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => setPayingSale(sale)}
                      className={rowActionClass(rowActionAccents.green)}
                    >
                      Pay
                    </button>

                    <button
                      type="button"
                      onClick={() => printInvoice(sale)}
                      className={rowActionClass(rowActionAccents.purple)}
                    >
                      Print
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeletingSale(sale)}
                      className={rowActionClass(rowActionAccents.red)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={visibleSales.length}
            pageSize={salesPerPage}
          />
        </>
      )}

      {/* Edit Modal */}
      <EditSaleModal
        sale={editingSale}
        onClose={closeEditModal}
        onSave={handleSaveEdit}
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
        }}
      />

      {/* Delete Modal */}
      <DeleteSaleModal
        sale={deletingSale}
        onClose={() => setDeletingSale(null)}
        onConfirm={async () => {
          await deleteOpenSale(deletingSale.id);
          setDeletingSale(null);
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
    </div>
  );
};

export default ListSales;
