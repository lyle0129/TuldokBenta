// components/admin/AddShopModal.jsx
import { useEffect, useState } from "react";
import Modal from "../shared/Modal";
import ShopProfileFields from "./ShopProfileFields";
import { emptyProfile, profileBody } from "../../utils/shopProfile";
// The shop slug and a payment method's code are normalised by the same rule on
// the server, so they share the one implementation here too.
import { slugifyCode } from "../../utils/paymentMethods";
import {
  labelClass,
  inputClass,
  alertClass,
  noticeClass,
  cancelButtonClass,
  submitButtonClass,
} from "../shared/fieldStyles";

const EMPTY = { name: "", slug: "", ...emptyProfile };

/**
 * Opening a branch.
 *
 * The slug follows the name until it is edited by hand — the same pattern as
 * AddPaymentMethodModal, and for a stronger reason: a shop's slug is frozen the
 * moment it is saved, because every row in five tables is filed under that
 * shop and the server refuses to change it afterwards.
 */
const AddShopModal = ({
  open,
  onClose,
  onSubmit,
  existingSlugs = [],
  isSubmitting = false,
  errorMessage = null,
}) => {
  const [form, setForm] = useState(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setSlugTouched(false);
    }
  }, [open]);

  const name = form.name.trim();
  const slug = slugTouched ? slugifyCode(form.slug) : slugifyCode(name);
  const duplicate = existingSlugs.includes(slug);

  const isValid = name !== "" && slug !== "" && slug.length <= 50 && !duplicate;

  const submit = () => {
    if (!isValid || isSubmitting) return;
    onSubmit({ name, slug, ...profileBody(form) });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Shop"
      accent="blue"
      size="lg"
      variant="sheet"
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
            {isSubmitting ? "Creating…" : "Create Shop"}
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
          <label className={labelClass} htmlFor="add-shop-name">
            Shop Name
          </label>
          <input
            id="add-shop-name"
            type="text"
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Spincredible Cubao"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="add-shop-slug">
            Slug
          </label>
          <input
            id="add-shop-slug"
            type="text"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setForm({ ...form, slug: e.target.value });
            }}
            className={`${inputClass} font-mono`}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            The key this shop's data is filed under. This cannot be changed later
            — the name above can be edited any time.
          </p>
          {duplicate && (
            <p className={`${noticeClass} mt-2`}>
              A shop with the slug “{slug}” already exists. Edit that one instead.
            </p>
          )}
        </div>

        {/* Requirement 2.6. The payment-method seed in initDB.js fires once ever
            and its rows belong to Shop 1, so createShop seeds this shop's own
            pair in the same transaction — worth saying, because an empty pay
            dialog on a new branch has no obvious cause. */}
        <p className={noticeClass}>
          A new shop starts with Cash and GCash as its payment methods, and an
          empty inventory and service list. Nothing is copied from another shop.
        </p>

        <ShopProfileFields form={form} onChange={setForm} idPrefix="add-shop" />
      </form>
    </Modal>
  );
};

export default AddShopModal;
