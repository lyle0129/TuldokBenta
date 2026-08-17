import React, { useState } from "react";
import Modal from "../shared/Modal";

const DeleteSaleModal = ({ sale, onClose, onConfirm }) => {
  // Declared before the null guard: hooks must run in the same order on every
  // render, and the guard used to sit above them.
  const [confirmText, setConfirmText] = useState("");

  if (!sale) return null;

  const canDelete = confirmText.toLowerCase() === "delete";

  return (
    <Modal
      open
      onClose={onClose}
      title="⚠️ Confirm Delete"
      accent="red"
      size="md"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 min-h-11 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!canDelete}
            onClick={onConfirm}
            className={`flex-1 px-4 min-h-11 rounded-md font-medium transition-colors ${
              canDelete
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-red-300 dark:bg-red-800 text-gray-100 cursor-not-allowed"
            }`}
          >
            Delete Permanently
          </button>
        </div>
      }
    >
      <p className="text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
        To confirm deletion of{" "}
        <strong className="text-gray-900 dark:text-white">
          Invoice #{sale.invoice_number}
        </strong>
        , please type <span className="font-semibold text-red-600">delete</span> below.
      </p>

      <input
        type="text"
        aria-label="Type delete to confirm"
        placeholder="Type 'delete' to confirm"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        className="w-full min-h-11 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-md px-3 focus:ring-2 focus:ring-red-500 outline-none"
      />
    </Modal>
  );
};

export default DeleteSaleModal;
