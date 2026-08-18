// components/inventory/RestockModal.jsx
import { useEffect, useState } from "react";
import Modal from "../shared/Modal";
import {
  labelClass,
  inputClass,
  alertClass,
  cancelButtonClass,
  submitButtonClass,
} from "../shared/fieldStyles";

/** Tap-sized shortcuts for the amounts a delivery usually arrives in. */
const QUICK_AMOUNTS = [1, 5, 10, 50];

/**
 * "A delivery arrived" — adds to the stock already on the item.
 *
 * Deliberately one field with no way to type an absolute number. The absolute
 * value lives in EditItemModal, because writing one overwrites whatever sales
 * have deducted since the form was opened; this modal's amount is sent to
 * POST /inventory/:id/restock, which increments in SQL instead.
 */
const RestockModal = ({
  item,
  onClose,
  onConfirm,
  isSubmitting = false,
  errorMessage = null,
}) => {
  const [amount, setAmount] = useState("");

  // Declared before the null guard: hooks must run in the same order on every
  // render. Reopening on a different item must not inherit the last amount.
  useEffect(() => {
    setAmount("");
  }, [item?.id]);

  if (!item) return null;

  const parsed = Number(amount);
  const isValid = amount !== "" && Number.isInteger(parsed) && parsed >= 1;
  const current = Number(item.stock) || 0;

  const submit = () => {
    if (!isValid || isSubmitting) return;
    onConfirm(item.id, parsed);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add Stock"
      accent="green"
      size="sm"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button type="button" onClick={onClose} className={cancelButtonClass}>
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!isValid || isSubmitting}
            className={submitButtonClass("bg-green-600 hover:bg-green-700")}
          >
            {isSubmitting ? "Adding…" : "Add to Stock"}
          </button>
        </div>
      }
    >
      {errorMessage && (
        <div role="alert" className={`${alertClass} mb-4`}>
          {errorMessage}
        </div>
      )}

      <p className="font-semibold text-gray-800 dark:text-gray-100">
        {item.item_name}
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Currently {current} in stock
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className={labelClass} htmlFor="restock-amount">
          Quantity to add
        </label>
        <input
          id="restock-amount"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className={`${inputClass} focus:ring-green-500`}
        />

        <div className="flex gap-2 mt-3">
          {QUICK_AMOUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setAmount(String((Number(amount) || 0) + n))}
              className="flex-1 min-h-11 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition"
            >
              +{n}
            </button>
          ))}
        </div>

        {/* Shows the arithmetic so nobody mistakes this for the absolute field. */}
        <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
          {current}
          <span className="mx-2 text-gray-400 dark:text-gray-500">→</span>
          <span className="text-lg font-bold text-green-700 dark:text-green-400">
            {isValid ? current + parsed : current}
          </span>
          <span className="ml-1">in stock</span>
        </p>
      </form>
    </Modal>
  );
};

export default RestockModal;
