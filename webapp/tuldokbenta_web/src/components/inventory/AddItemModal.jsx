// components/inventory/AddItemModal.jsx
import { useEffect, useState } from "react";
import Modal from "../shared/Modal";
import {
  labelClass,
  inputClass,
  alertClass,
  noticeClass,
  cancelButtonClass,
  submitButtonClass,
} from "../shared/fieldStyles";

const EMPTY = { item_name: "", item_classification: "", stock: "", price: "" };

/**
 * Creating a brand new item.
 *
 * This used to be a five-column grid pinned above the list, taking up the top
 * of the page on every visit for something done a few times a month.
 *
 * The duplicate-name warning matters: POST /inventory is an upsert keyed on
 * item_name, so submitting an existing name silently restocks that item *and*
 * overwrites its price. The list is already in memory, so we can catch it here
 * and point at Add Stock instead.
 */
const AddItemModal = ({
  open,
  onClose,
  onSubmit,
  classifications = [],
  existingNames = [],
  isSubmitting = false,
  errorMessage = null,
}) => {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const name = form.item_name.trim();
  const duplicate = existingNames.some(
    (existing) => existing.toLowerCase() === name.toLowerCase()
  );
  const price = Number(form.price);
  const stock = form.stock === "" ? 0 : Number(form.stock);

  const isValid =
    name !== "" &&
    form.item_classification.trim() !== "" &&
    form.price !== "" &&
    Number.isFinite(price) &&
    price >= 0 &&
    Number.isInteger(stock) &&
    stock >= 0;

  const submit = () => {
    if (!isValid || isSubmitting) return;
    onSubmit({
      item_name: name,
      item_classification: form.item_classification.trim(),
      stock,
      price,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Item"
      accent="blue"
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
            className={submitButtonClass("bg-blue-600 hover:bg-blue-700")}
          >
            {isSubmitting ? "Saving…" : "Add Item"}
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
          <label className={labelClass} htmlFor="add-item-name">
            Item Name
          </label>
          <input
            id="add-item-name"
            type="text"
            autoFocus
            value={form.item_name}
            onChange={set("item_name")}
            className={inputClass}
          />
          {duplicate && (
            <p className={`${noticeClass} mt-2`}>
              “{name}” already exists. Saving would add to its stock and
              overwrite its price — use <strong>Add Stock</strong> on that item
              instead.
            </p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="add-item-classification">
            Classification
          </label>
          <input
            id="add-item-classification"
            type="text"
            list="add-item-classifications"
            value={form.item_classification}
            onChange={set("item_classification")}
            placeholder="Type or select"
            className={inputClass}
          />
          <datalist id="add-item-classifications">
            {classifications.map((cls) => (
              <option key={cls} value={cls} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="add-item-stock">
              Starting Stock
            </label>
            <input
              id="add-item-stock"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={form.stock}
              onChange={set("stock")}
              placeholder="0"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="add-item-price">
              Price (₱)
            </label>
            <input
              id="add-item-price"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.price}
              onChange={set("price")}
              placeholder="0.00"
              className={inputClass}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
};

export default AddItemModal;
