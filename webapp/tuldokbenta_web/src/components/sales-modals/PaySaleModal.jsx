import React, { useState, useEffect } from "react";
import Modal from "../shared/Modal";
import { usePaymentMethods } from "../../hooks/usePaymentMethods";
import { alertClass, noticeClass } from "../shared/fieldStyles";

const PaySaleModal = ({ sale, onClose, onConfirm }) => {
  // Declared before the null guard: hooks must run in the same order on every
  // render, and the guard used to sit above them.
  const [paymentMethod, setPaymentMethod] = useState("");

  // Reseed when a different sale is opened; this modal is mounted once and fed
  // whichever row was clicked. Without it the last invoice's method is
  // preselected with Confirm already enabled, and one misclick records the
  // wrong method on the next sale.
  useEffect(() => setPaymentMethod(""), [sale]);

  // The list is read here rather than drilled down from OpenSales, which is how
  // `paySale` arrives: this modal is its only consumer, and the query cache is
  // shared, so mounting the hook costs no extra request.
  const { activeMethods, isLoading, error } = usePaymentMethods();

  if (!sale) return null;

  const hasMethods = activeMethods.length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={`💳 Pay Invoice #${sale.invoice_number}`}
      accent="purple"
      size="md"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 min-h-11 rounded-md text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!paymentMethod}
            // Still emits the bare code string, exactly as before — ListSales
            // and the /pay-sale request are unchanged by this table existing.
            onClick={() => onConfirm(paymentMethod)}
            className="flex-1 px-4 min-h-11 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Confirm Payment
          </button>
        </div>
      }
    >
      {error && (
        <p role="alert" className={`${alertClass} mb-4`}>
          {error}
        </p>
      )}

      {!isLoading && !hasMethods ? (
        <p className={noticeClass}>
          No active payment methods. Add one under Payment Methods before taking
          a payment.
        </p>
      ) : (
        <label className="block text-gray-700 dark:text-gray-300 text-sm font-medium">
          Select Payment Method:
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            disabled={isLoading}
            className="mt-2 block w-full min-h-11 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-md px-3 focus:ring-2 focus:ring-purple-400 outline-none transition-colors disabled:opacity-60"
          >
            <option value="">
              {isLoading ? "Loading methods…" : "-- Select Method --"}
            </option>
            {activeMethods.map((method) => (
              <option key={method.id} value={method.code}>
                {method.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </Modal>
  );
};

export default PaySaleModal;
