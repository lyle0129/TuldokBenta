// components/services/EditServiceModal.jsx
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

/**
 * Editing a service.
 *
 * Only changed fields are sent — the page used to spread the whole row into
 * the PUT body, so opening and saving with no edits rewrote every column.
 */
const EditServiceModal = ({
  service,
  onClose,
  onSubmit,
  classifications = [],
  isSubmitting = false,
  errorMessage = null,
}) => {
  const [form, setForm] = useState(null);

  useEffect(() => {
    setForm(
      service
        ? {
            service_name: service.service_name ?? "",
            price: String(service.price ?? ""),
            freebies: service.freebies ?? [],
          }
        : null
    );
  }, [service]);

  if (!service || !form) return null;

  const name = form.service_name.trim();
  const price = Number(form.price);

  const isValid =
    name !== "" && form.price !== "" && Number.isFinite(price) && price >= 0;

  const renamed = name !== service.service_name;

  const toggleFreebie = (cls) =>
    setForm({
      ...form,
      freebies: form.freebies.includes(cls)
        ? form.freebies.filter((c) => c !== cls)
        : [...form.freebies, cls],
    });

  const freebiesChanged =
    JSON.stringify(form.freebies) !== JSON.stringify(service.freebies ?? []);

  const submit = () => {
    if (!isValid || isSubmitting) return;

    const updates = {};
    if (renamed) updates.service_name = name;
    if (price !== Number(service.price)) updates.price = price;
    if (freebiesChanged) updates.freebies = form.freebies;

    onSubmit(service.id, updates);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit Service"
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
          <label className={labelClass} htmlFor="edit-service-name">
            Service Name
          </label>
          <input
            id="edit-service-name"
            type="text"
            value={form.service_name}
            onChange={(e) => setForm({ ...form, service_name: e.target.value })}
            className={`${inputClass} focus:ring-yellow-500`}
          />
          {renamed && (
            <p className={`${noticeClass} mt-2`}>
              Renaming breaks the link to this service on any unpaid open sale —
              sale lines reference services by name.
            </p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="edit-service-price">
            Price (₱)
          </label>
          <input
            id="edit-service-price"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            className={`${inputClass} focus:ring-yellow-500`}
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

export default EditServiceModal;
