import React, { useState, useEffect } from "react";
import Modal from "../shared/Modal";
import {
  labelClass,
  inputClass,
  alertClass,
  cancelButtonClass,
  submitButtonClass,
} from "../shared/fieldStyles";

/**
 * Name a sale that has already been paid.
 *
 * The only edit a closed sale allows, because it is the only one that moves no
 * stock — everything else still has to go through Revert. That is also why this
 * isn't EditSaleModal with the lines hidden: it saves one field to a different
 * endpoint, and pretending otherwise would invite the lines back.
 *
 * Sales taken before the field existed have no name at all, so an empty box is
 * the normal starting state rather than a mistake.
 */
const CustomerNameModal = ({ sale, onClose, onSave }) => {
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reseed when a different sale is opened; the modal is mounted once and fed
  // whichever row was clicked.
  useEffect(() => {
    setName(sale?.customer_name ?? "");
    setError(null);
  }, [sale]);

  if (!sale) return null;

  const handleSave = async () => {
    setIsSaving(true);
    // An emptied box clears the name rather than leaving the old one — the
    // server reads "" as "clear it".
    const { ok, message } = await onSave(name.trim());
    setIsSaving(false);

    if (!ok) {
      setError(message || "Could not save the customer name.");
      return;
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Customer · Invoice #${sale.invoice_number}`}
      accent="blue"
      size="md"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 ${cancelButtonClass}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={`flex-1 ${submitButtonClass(
              "bg-blue-600 hover:bg-blue-700"
            )}`}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      {error && (
        <div role="alert" className={`mb-4 ${alertClass}`}>
          {error}
        </div>
      )}

      <label htmlFor="closed-customer-name" className={labelClass}>
        Customer name
      </label>
      <input
        id="closed-customer-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Who was this sale for?"
        maxLength={255}
        className={inputClass}
      />
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Leave this empty to remove the name. Nothing else about the sale
        changes.
      </p>
    </Modal>
  );
};

export default CustomerNameModal;
