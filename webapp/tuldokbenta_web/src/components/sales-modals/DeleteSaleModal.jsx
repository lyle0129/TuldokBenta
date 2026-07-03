import React, { useState } from "react";

const DeleteSaleModal = ({ sale, onClose, onConfirm }) => {
  if (!sale) return null;

  const [confirmText, setConfirmText] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white dark:bg-gray-900 border-t-4 border-red-600 rounded-2xl shadow-xl w-full max-w-md p-6 sm:p-8 transition-all">
        <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-red-600 flex items-center gap-2">
          ⚠️ Confirm Delete
        </h2>

        <p className="text-gray-700 dark:text-gray-300 mb-6 leading-relaxed">
          To confirm deletion of{" "}
          <strong className="text-gray-900 dark:text-white">
            Invoice #{sale.invoice_number}
          </strong>, please type{" "}
          <span className="font-semibold text-red-600">delete</span> below.
        </p>

        <input
          type="text"
          placeholder="Type 'delete' to confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="w-full mb-6 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 
                    text-gray-800 dark:text-gray-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-red-500 outline-none"
        />

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 
                      hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>

          <button
            disabled={confirmText.toLowerCase() !== "delete"}
            onClick={onConfirm}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              confirmText.toLowerCase() === "delete"
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-red-300 dark:bg-red-800 text-gray-100 cursor-not-allowed"
            }`}
          >
            Delete Permanently
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteSaleModal;
