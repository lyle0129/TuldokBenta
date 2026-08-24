// components/admin/ReceiptPreviewModal.jsx
import { useEffect, useState } from "react";
import Modal from "../shared/Modal";
import ReceiptPreview from "../shared/ReceiptPreview";
import { fetchShopLogo } from "../../hooks/useAdminShops";
import { cancelButtonClass } from "../shared/fieldStyles";

/**
 * What a given shop's receipts look like right now, without opening the editor.
 *
 * The list row carries `has_logo` rather than the image itself — a console
 * showing ten shops must not fetch ten images to draw ten cards — so the one
 * shop being looked at fetches its own.
 */
const ReceiptPreviewModal = ({ shop, onClose }) => {
  const [logoDataUrl, setLogoDataUrl] = useState("");

  useEffect(() => {
    setLogoDataUrl("");
    if (!shop?.has_logo) return;

    const controller = new AbortController();

    fetchShopLogo(shop.id, controller.signal)
      .then((result) => setLogoDataUrl(result?.logo_data_url ?? ""))
      .catch((err) => {
        // The receipt still renders, just without the logo. Not worth a banner
        // on a read-only preview.
        if (err?.name !== "AbortError") console.error("Error loading shop logo:", err);
      });

    return () => controller.abort();
  }, [shop?.id, shop?.has_logo]);

  if (!shop) return null;

  return (
    <Modal
      open={Boolean(shop)}
      onClose={onClose}
      title={`${shop.name} receipt`}
      accent="purple"
      size="lg"
      variant="sheet"
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={cancelButtonClass}>
            Close
          </button>
        </div>
      }
    >
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        A sample sale rendered with this shop's details, at its configured paper
        width of {shop.receipt_paper_width_mm}mm. Edit the shop to change any of
        it.
      </p>

      <ReceiptPreview shop={{ ...shop, logo_data_url: logoDataUrl }} />
    </Modal>
  );
};

export default ReceiptPreviewModal;
