// components/admin/EditShopModal.jsx
import { useEffect, useState } from "react";
import Modal from "../shared/Modal";
import ShopProfileFields from "./ShopProfileFields";
import { profileBody, profileFrom } from "../../utils/shopProfile";
import {
  labelClass,
  inputClass,
  alertClass,
  noticeClass,
  cancelButtonClass,
  submitButtonClass,
} from "../shared/fieldStyles";

/**
 * Editing a shop's name and receipt profile.
 *
 * `slug` is shown and disabled rather than hidden. It is the key five tables
 * file their rows under, the server refuses to change it, and an admin looking
 * for the field needs to see that it exists and is fixed — a missing field
 * reads as an oversight, a disabled one reads as a decision.
 *
 * `warning` is the sentence updateShop returns when the invoice prefix changed
 * on a shop that already has sales. It arrives AFTER a successful save, so the
 * modal stays open holding it: numbering does not reset (ticket 02 decoupled
 * invoice_seq from the displayed string) but receipts either side of the change
 * look unrelated, and the owner is entitled to see that said out loud.
 */
const EditShopModal = ({
  shop,
  onClose,
  onSubmit,
  warning = null,
  isSubmitting = false,
  errorMessage = null,
}) => {
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (shop) setForm({ name: shop.name ?? "", ...profileFrom(shop) });
  }, [shop]);

  if (!shop || !form) return null;

  const name = form.name.trim();
  const isValid = name !== "";

  const submit = () => {
    if (!isValid || isSubmitting) return;
    onSubmit(shop.id, { name, ...profileBody(form) });
  };

  return (
    <Modal
      open={Boolean(shop)}
      onClose={onClose}
      title={`Edit ${shop.name}`}
      accent="yellow"
      size="lg"
      variant="sheet"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button type="button" onClick={onClose} className={cancelButtonClass}>
            {warning ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={warning ? onClose : submit}
            disabled={!isValid || isSubmitting}
            className={submitButtonClass("bg-yellow-600 hover:bg-yellow-700")}
          >
            {warning ? "Got it" : isSubmitting ? "Saving…" : "Save Changes"}
          </button>
        </div>
      }
    >
      {errorMessage && (
        <div role="alert" className={`${alertClass} mb-4`}>
          {errorMessage}
        </div>
      )}

      {warning && (
        <div role="status" className={`${noticeClass} mb-4`}>
          {warning}
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
          <label className={labelClass} htmlFor="edit-shop-name">
            Shop Name
          </label>
          <input
            id="edit-shop-name"
            type="text"
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="edit-shop-slug">
            Slug
          </label>
          <input
            id="edit-shop-slug"
            type="text"
            value={shop.slug}
            readOnly
            disabled
            className={`${inputClass} font-mono opacity-60 cursor-not-allowed`}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Fixed once the shop exists — every sale, item and audit row is filed
            under it.
          </p>
        </div>

        <ShopProfileFields form={form} onChange={setForm} idPrefix="edit-shop" />
      </form>
    </Modal>
  );
};

export default EditShopModal;
