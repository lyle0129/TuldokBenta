// components/services/AddServiceModal.jsx
import { useEffect, useState } from "react";
import Modal from "../shared/Modal";
import FreebiePicker from "./FreebiePicker";
import {
  labelClass,
  inputClass,
  alertClass,
  noticeClass,
  cancelButtonClass,
  submitButtonClass,
} from "../shared/fieldStyles";

const EMPTY = { service_name: "", price: "", freebies: [] };

/**
 * Creating a service.
 *
 * Was a panel pinned above the list, open on every visit for something done a
 * handful of times a year.
 */
const AddServiceModal = ({
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

  const name = form.service_name.trim();
  const price = Number(form.price);

  // service_name is UNIQUE in the schema, so a duplicate is a server error
  // rather than an upsert. Cheaper to catch it here than to submit and fail.
  const duplicate = existingNames.some(
    (existing) => existing.toLowerCase() === name.toLowerCase()
  );

  const isValid =
    name !== "" &&
    !duplicate &&
    form.price !== "" &&
    Number.isFinite(price) &&
    price >= 0;

  const toggleFreebie = (cls) =>
    setForm({
      ...form,
      freebies: form.freebies.includes(cls)
        ? form.freebies.filter((c) => c !== cls)
        : [...form.freebies, cls],
    });

  const submit = () => {
    if (!isValid || isSubmitting) return;
    onSubmit({ service_name: name, price, freebies: form.freebies });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Service"
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
            {isSubmitting ? "Saving…" : "Add Service"}
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
          <label className={labelClass} htmlFor="add-service-name">
            Service Name
          </label>
          <input
            id="add-service-name"
            type="text"
            autoFocus
            value={form.service_name}
            onChange={(e) => setForm({ ...form, service_name: e.target.value })}
            className={inputClass}
          />
          {duplicate && (
            <p className={`${noticeClass} mt-2`}>
              A service called “{name}” already exists. Edit that one instead.
            </p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="add-service-price">
            Price (₱)
          </label>
          <input
            id="add-service-price"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            placeholder="0.00"
            className={inputClass}
          />
        </div>

        <div>
          <span className={labelClass}>Freebies Included</span>
          <FreebiePicker
            classifications={classifications}
            selected={form.freebies}
            onToggle={toggleFreebie}
          />
        </div>
      </form>
    </Modal>
  );
};

export default AddServiceModal;
