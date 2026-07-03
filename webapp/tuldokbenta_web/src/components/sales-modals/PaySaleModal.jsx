import React, { useState } from "react";

const PaySaleModal = ({ sale, onClose, onConfirm }) => {
  if (!sale) return null;

  const [paymentMethod, setPaymentMethod] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white dark:bg-gray-900 border-t-4 border-purple-500 rounded-2xl shadow-xl w-full max-w-md p-6 sm:p-8 transition-all">
        <h2 className="text-xl sm:text-2xl font-semibold mb-6 text-gray-800 dark:text-gray-100 flex items-center gap-2">
          💳 Pay Invoice #{sale.invoice_number}
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
            onClick={onClose}
            className="px-4 py-2 rounded-md text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>

          <button
            disabled={!paymentMethod}
            onClick={() => onConfirm(paymentMethod)}
            className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50 transition-colors"
          >
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaySaleModal;
