// components/payment-methods/AddPaymentMethodModal.jsx
import { useEffect, useState } from "react";
import Modal from "../shared/Modal";
import IconPicker from "./IconPicker";
import { slugifyCode } from "../../utils/paymentMethods";
import {
  labelClass,
  inputClass,
  alertClass,
  noticeClass,
  cancelButtonClass,
  submitButtonClass,
} from "../shared/fieldStyles";

const EMPTY = { label: "", code: "", icon: "wallet" };

/**
 * Creating a payment method.
 *
 * The code is derived from the label until the admin edits it, because it is
 * permanent once saved — every sale paid with this method stores that string
 * and nothing rewrites them later.
 */
const AddPaymentMethodModal = ({
  open,
  onClose,
  onSubmit,
  existingCodes = [],
  isSubmitting = false,
  errorMessage = null,
}) => {
  const [form, setForm] = useState(EMPTY);
  // Once the code has been typed in by hand, the label stops driving it.
  const [codeTouched, setCodeTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setCodeTouched(false);
    }
  }, [open]);

  const label = form.label.trim();
  const code = codeTouched ? slugifyCode(form.code) : slugifyCode(label);

  // code is UNIQUE in the schema, so a duplicate is a 409 rather than an upsert.
  const duplicate = existingCodes.includes(code);

  const isValid = label !== "" && code !== "" && !duplicate && code.length <= 50;

  const submit = () => {
    if (!isValid || isSubmitting) return;
    onSubmit({ label, code, icon: form.icon });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Payment Method"
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
            {isSubmitting ? "Saving…" : "Add Method"}
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
          <label className={labelClass} htmlFor="add-method-label">
            Display Name
          </label>
          <input
            id="add-method-label"
            type="text"
            autoFocus
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="e.g. Maya"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="add-method-code">
            Stored Code
          </label>
          <input
            id="add-method-code"
            type="text"
            value={code}
            onChange={(e) => {
              setCodeTouched(true);
              setForm({ ...form, code: e.target.value });
            }}
            className={`${inputClass} font-mono`}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            What every sale records. This cannot be changed later — the display
            name above can be edited any time.
          </p>
          {duplicate && (
            <p className={`${noticeClass} mt-2`}>
              A payment method with the code “{code}” already exists. Edit that
              one instead.
            </p>
          )}
        </div>

        <div>
          <span className={labelClass}>Icon</span>
          <IconPicker
            value={form.icon}
            onChange={(icon) => setForm({ ...form, icon })}
          />
        </div>
      </form>
    </Modal>
  );
};

export default AddPaymentMethodModal;
