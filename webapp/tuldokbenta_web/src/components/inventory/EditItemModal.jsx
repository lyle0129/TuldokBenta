// components/inventory/EditItemModal.jsx
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

/**
 * Correcting an item's details.
 *
 * The stock field here is an absolute set, not an addition, which is why it
 * sits below a divider and says so: typing a number that was read a minute ago
 * overwrites any deduction a sale made in between. Routine restocking belongs
 * in RestockModal.
 *
 * Only changed fields are sent — the page used to spread the whole row into the
 * PUT body, so opening and saving with no edits still rewrote every column.
 */
const EditItemModal = ({
  item,
  onClose,
  onSubmit,
  classifications = [],
  isSubmitting = false,
  errorMessage = null,
}) => {
  const [form, setForm] = useState(null);

  useEffect(() => {
    setForm(
      item
        ? {
            item_name: item.item_name ?? "",
            item_classification: item.item_classification ?? "",
            price: String(item.price ?? ""),
            stock: String(item.stock ?? ""),
          }
        : null
    );
  }, [item]);

  if (!item || !form) return null;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const name = form.item_name.trim();
  const price = Number(form.price);
  const stock = Number(form.stock);

  const isValid =
    name !== "" &&
    form.price !== "" &&
    Number.isFinite(price) &&
    price >= 0 &&
    form.stock !== "" &&
    Number.isInteger(stock) &&
    stock >= 0;

  const renamed = name !== item.item_name;
  const stockChanged = stock !== Number(item.stock);

  const submit = () => {
    if (!isValid || isSubmitting) return;

    const updates = {};
    if (renamed) updates.item_name = name;
    if (form.item_classification.trim() !== (item.item_classification ?? "")) {
      updates.item_classification = form.item_classification.trim();
    }
    if (price !== Number(item.price)) updates.price = price;
    if (stockChanged) updates.stock = stock;

    onSubmit(item.id, updates);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit Item"
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
            className={submitButtonClass("bg-yellow-500 hover:bg-yellow-600")}
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
          <label className={labelClass} htmlFor="edit-item-name">
            Item Name
          </label>
          <input
            id="edit-item-name"
            type="text"
            value={form.item_name}
            onChange={set("item_name")}
            className={`${inputClass} focus:ring-yellow-500`}
          />
          {renamed && (
            <p className={`${noticeClass} mt-2`}>
              Renaming breaks the link to this item on any unpaid open sale —
              those lines will not restock if the sale is edited or deleted.
            </p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="edit-item-classification">
            Classification
          </label>
          <input
            id="edit-item-classification"
            type="text"
            list="edit-item-classifications"
            value={form.item_classification}
            onChange={set("item_classification")}
            placeholder="Type or select"
            className={`${inputClass} focus:ring-yellow-500`}
          />
          <datalist id="edit-item-classifications">
            {classifications.map((cls) => (
              <option key={cls} value={cls} />
            ))}
          </datalist>
        </div>

        <div>
          <label className={labelClass} htmlFor="edit-item-price">
            Price (₱)
          </label>
          <input
            id="edit-item-price"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={form.price}
            onChange={set("price")}
            className={`${inputClass} focus:ring-yellow-500`}
          />
        </div>

        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <label className={labelClass} htmlFor="edit-item-stock">
            Correct Stock Count
          </label>
          <input
            id="edit-item-stock"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={form.stock}
            onChange={set("stock")}
            className={`${inputClass} focus:ring-yellow-500`}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Replaces the count outright — for a physical recount, not a delivery.
            Use <strong>Add Stock</strong> to add to what is already there.
          </p>
          {stockChanged && (
            <p className={`${noticeClass} mt-2`}>
              Overwrites {item.stock} with {form.stock}. Any sale made since this
              page loaded will not be reflected.
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
};

export default EditItemModal;
