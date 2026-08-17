import React, { useState } from "react";
import Modal from "../shared/Modal";

const PaySaleModal = ({ sale, onClose, onConfirm }) => {
  // Declared before the null guard: hooks must run in the same order on every
  // render, and the guard used to sit above them.
  const [paymentMethod, setPaymentMethod] = useState("");

  if (!sale) return null;

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
            onClick={() => onConfirm(paymentMethod)}
            className="flex-1 px-4 min-h-11 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Confirm Payment
          </button>
        </div>
      }
    >
      <label className="block text-gray-700 dark:text-gray-300 text-sm font-medium">
        Select Payment Method:
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className="mt-2 block w-full min-h-11 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-md px-3 focus:ring-2 focus:ring-purple-400 outline-none transition-colors"
        >
          <option value="">-- Select Method --</option>
          <option value="cash">Cash</option>
          <option value="gcash">GCash</option>
        </select>
      </label>
    </Modal>
  );
};

export default PaySaleModal;
