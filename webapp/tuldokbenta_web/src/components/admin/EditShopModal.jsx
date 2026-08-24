// components/admin/EditShopModal.jsx
import { useEffect, useState } from "react";
import Modal from "../shared/Modal";
import ReceiptPreview from "../shared/ReceiptPreview";
import ShopProfileFields from "./ShopProfileFields";
import { fetchShopLogo } from "../../hooks/useAdminShops";
import { profileBody, profileFrom, profilePreview } from "../../utils/shopProfile";
import {
  labelClass,
  inputClass,
  alertClass,
  noticeClass,
  cancelButtonClass,
  submitButtonClass,
} from "../shared/fieldStyles";

/**
 * Editing a shop's name and receipt profile, with a live preview of the receipt
 * it will print.
 *
 * The preview is the real print document in a frame, not a re-creation of it, so
 * what an admin sees here is exactly what comes out of the printer.
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

  // undefined means "not touched", so a save sends no logo request at all. null
  // means the admin cleared it, and a File means they picked a new one. Three
  // states rather than two, because "leave whatever is there" and "remove what
  // is there" are different instructions.
  const [pendingLogo, setPendingLogo] = useState(undefined);

  // Keyed on the shop's id, not the object. A save that returns a warning hands
  // back a fresh row for the same shop and reopens the modal on it — re-seeding
  // there would throw away the logo that was just uploaded, because the admin
  // route's rows carry `has_logo` rather than the image itself.
  useEffect(() => {
    if (shop) {
      setForm({ name: shop.name ?? "", ...profileFrom(shop) });
      setPendingLogo(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop?.id]);

  // The list carries has_logo rather than the image, so the image is fetched
  // here — once, for the one shop actually being looked at.
  useEffect(() => {
    if (!shop?.has_logo) return;

    const controller = new AbortController();

    fetchShopLogo(shop.id, controller.signal)
      .then((result) => {
        if (result?.logo_data_url) {
          setForm((current) =>
            current ? { ...current, logo_data_url: result.logo_data_url } : current
          );
        }
      })
      .catch((err) => {
        // The preview shows no logo and the form still saves. Not worth a banner
        // over the fields the admin actually came here to edit.
        if (err?.name !== "AbortError") console.error("Error loading shop logo:", err);
      });

    return () => controller.abort();
  }, [shop?.id, shop?.has_logo]);

  if (!shop || !form) return null;

  const name = form.name.trim();
  const isValid = name !== "";

  const pickLogo = (file, dataUrl) => {
    setPendingLogo(file);
    setForm((current) => ({ ...current, logo_data_url: dataUrl }));
  };

  const submit = () => {
    if (!isValid || isSubmitting) return;
    onSubmit(shop.id, { name, ...profileBody(form) }, pendingLogo);
  };

  return (
    <Modal
      open={Boolean(shop)}
      onClose={onClose}
      title={`Edit ${shop.name}`}
      accent="yellow"
      size="2xl"
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

          <ShopProfileFields
            form={form}
            onChange={setForm}
            onPickLogo={pickLogo}
            idPrefix="edit-shop"
            disabled={isSubmitting}
          />
        </form>

        <ReceiptPreview shop={profilePreview(form, form.name)} className="lg:sticky lg:top-0" />
      </div>
    </Modal>
  );
};

export default EditShopModal;
