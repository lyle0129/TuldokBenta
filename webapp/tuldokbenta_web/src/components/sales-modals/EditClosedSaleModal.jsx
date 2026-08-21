import React, { useState, useEffect, useMemo } from "react";
import Modal from "../shared/Modal";
import { usePaymentMethods } from "../../hooks/usePaymentMethods";
import { buildMethodLookup, resolveMethod } from "../../utils/paymentMethods";
import {
  labelClass,
  inputClass,
  alertClass,
  cancelButtonClass,
  submitButtonClass,
} from "../shared/fieldStyles";

/**
 * Edit a sale that has already been paid.
 *
 * Only the two fields that move no stock: who the sale was for, and which
 * tender settled it. Everything else still has to go through Revert, which is
 * also why this isn't EditSaleModal with the lines hidden — it saves to a
 * different endpoint that refuses to touch them, and pretending otherwise would
 * invite the lines back.
 *
 * Correcting the method used to mean Revert then re-Pay, which stamps a new
 * `paid_at` and shifts the sale to today in every report keyed off the payment
 * date. This leaves `paid_at` alone.
 *
 * Sales taken before the customer field existed have no name at all, so an
 * empty box is the normal starting state rather than a mistake.
 */
const EditClosedSaleModal = ({ sale, onClose, onSave }) => {
  const [name, setName] = useState("");
  const [method, setMethod] = useState("");
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const { paymentMethods, activeMethods, isLoading } = usePaymentMethods();
  // Built from the full list, not just the active one: a deactivated method
  // still has an admin-given label, and showing it beats falling back to a
  // title-cased code.
  const methodLookup = useMemo(
    () => buildMethodLookup(paymentMethods),
    [paymentMethods]
  );

  // Reseed when a different sale is opened; the modal is mounted once and fed
  // whichever row was clicked.
  useEffect(() => {
    setName(sale?.customer_name ?? "");
    setMethod(sale?.paid_using ?? "");
    setError(null);
  }, [sale]);

  if (!sale) return null;

  /**
   * The method this sale was actually paid with, when the active list doesn't
   * carry it — deactivated since, or a code predating the payment_methods table.
   *
   * It has to stay in the list. Without it the select would have no option
   * matching its own value, and the browser would fall back to whatever sits
   * first — so opening the dialog to fix a typo in the customer name would
   * quietly rewrite the tender.
   *
   * The "(no longer offered)" note waits for the list to load, though. While the
   * fetch is still in flight `activeMethods` is empty and *every* method looks
   * retired, which would flash that warning on a perfectly ordinary sale.
   */
  const missingFromList =
    sale.paid_using && !activeMethods.some((m) => m.code === sale.paid_using);
  const retiredMethod = missingFromList ? sale.paid_using : null;

  const handleSave = async () => {
    setIsSaving(true);

    // Only what actually changed. An absent key means "leave it alone" to the
    // server, so naming a sale never touches its method and vice versa — which
    // is what lets a sale settled with a retired method still be renamed.
    const patch = {};
    const trimmed = name.trim();
    // An emptied box clears the name rather than leaving the old one — the
    // server reads "" as "clear it".
    if (trimmed !== (sale.customer_name ?? "")) patch.customer_name = trimmed;
    if (method && method !== sale.paid_using) patch.paid_using = method;

    if (Object.keys(patch).length === 0) {
      setIsSaving(false);
      onClose();
      return;
    }

    const { ok, message } = await onSave(patch);
    setIsSaving(false);

    if (!ok) {
      setError(message || "Could not save the changes.");
      return;
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit Invoice #${sale.invoice_number}`}
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
        Leave this empty to remove the name.
      </p>

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <label htmlFor="closed-payment-method" className={labelClass}>
          Payment method
        </label>
        <select
          id="closed-payment-method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          disabled={isLoading}
          className={`${inputClass} disabled:opacity-60`}
        >
          {retiredMethod && (
            <option value={retiredMethod}>
              {resolveMethod(methodLookup, retiredMethod).label}
              {!isLoading && " (no longer offered)"}
            </option>
          )}
          {activeMethods.map((m) => (
            <option key={m.id} value={m.code}>
              {m.label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Corrects which tender settled this sale. The amount, the items and the
          time it was paid all stay as they are — to change those, revert the
          sale first.
        </p>
      </div>
    </Modal>
  );
};

export default EditClosedSaleModal;
