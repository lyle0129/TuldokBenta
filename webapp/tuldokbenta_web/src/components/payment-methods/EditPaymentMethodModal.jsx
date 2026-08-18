// components/payment-methods/EditPaymentMethodModal.jsx
import { useEffect, useState } from "react";
import Modal from "../shared/Modal";
import IconPicker from "./IconPicker";
import {
  labelClass,
  inputClass,
  alertClass,
  cancelButtonClass,
  submitButtonClass,
} from "../shared/fieldStyles";

/**
 * Editing a payment method — display fields only.
 *
 * The code is shown but locked. Every closed sale stores it as a bare string
 * with no foreign key, so changing it here would leave those sales pointing at
 * a method that no longer exists. Splitting label from code is what makes
 * renaming safe: rename freely, the stored value never moves.
 */
const EditPaymentMethodModal = ({
  method,
  onClose,
  onSubmit,
  isSubmitting = false,
  errorMessage = null,
}) => {
  const [form, setForm] = useState(null);

  useEffect(() => {
    setForm(
      method
        ? {
            label: method.label ?? "",
            icon: method.icon ?? "wallet",
            is_active: Boolean(method.is_active),
          }
        : null
    );
  }, [method]);

  if (!method || !form) return null;

  const label = form.label.trim();
  const isValid = label !== "";

  const submit = () => {
    if (!isValid || isSubmitting) return;

    // Only what changed, pairing with the server's COALESCE update.
    const updates = {};
    if (label !== method.label) updates.label = label;
    if (form.icon !== (method.icon ?? "wallet")) updates.icon = form.icon;
    if (form.is_active !== Boolean(method.is_active)) {
      updates.is_active = form.is_active;
    }

    onSubmit(method.id, updates);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit Payment Method"
      accent="yellow"
      size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button type="button" onClick={onClose} className={cancelButtonClass}>
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!isValid || isSubmitting}
            className={submitButtonClass("bg-yellow-600 hover:bg-yellow-700")}
          >
            {isSubmitting ? "Saving…" : "Save Changes"}
          </button>
        </div>
      }
    >
      {errorMessage && (
        <div role="alert" className={`${alertClass} mb-4`}>
          {errorMessage}
        </div>
      )}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <label className={labelClass} htmlFor="edit-method-label">
            Display Name
          </label>
          <input
            id="edit-method-label"
            type="text"
            autoFocus
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="edit-method-code">
            Stored Code
          </label>
          <input
            id="edit-method-code"
            type="text"
            value={method.code}
            disabled
            className={`${inputClass} font-mono opacity-60 cursor-not-allowed`}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Fixed: {method.usage_count ?? 0} past{" "}
            {(method.usage_count ?? 0) === 1 ? "sale records" : "sales record"}{" "}
            this exact value. Change the display name instead.
          </p>
        </div>

        <div>
          <span className={labelClass}>Icon</span>
          <IconPicker
            value={form.icon}
            onChange={(icon) => setForm({ ...form, icon })}
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Offer this method when taking a payment
          </span>
        </label>
      </form>
    </Modal>
  );
};

export default EditPaymentMethodModal;
