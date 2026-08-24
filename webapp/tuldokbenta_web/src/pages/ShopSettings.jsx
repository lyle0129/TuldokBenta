// pages/ShopSettings.jsx
import { useEffect, useState } from "react";
import { useShopProfile } from "../hooks/useShopProfile";
import ShopProfileFields from "../components/admin/ShopProfileFields";
import ReceiptPreview from "../components/shared/ReceiptPreview";
import {
  labelClass,
  inputClass,
  alertClass,
  noticeClass,
  submitButtonClass,
} from "../components/shared/fieldStyles";
import { profileBody, profileFrom, profilePreview } from "../utils/shopProfile";

/**
 * A manager editing their own shop's receipt.
 *
 * Reachable from the "Manage" group, so manager-and-up — the route's guard is
 * derived from navItems' `rolesForPath`, and the server refuses a worker's PUT
 * regardless.
 *
 * The preview beside the form is the real print document in a frame, so what is
 * on screen is exactly what the printer produces. That is the whole point of the
 * page: correcting a typo without burning a test receipt.
 */
const ShopSettings = () => {
  const {
    shopProfile,
    isLoading,
    error,
    mutationError,
    isMutating,
    updateProfile,
    uploadLogo,
    removeLogo,
  } = useShopProfile();

  const [form, setForm] = useState(null);

  // undefined = untouched, null = cleared, File = newly picked. Three states,
  // because "leave the logo alone" and "remove the logo" are different saves.
  const [pendingLogo, setPendingLogo] = useState(undefined);

  const [warning, setWarning] = useState(null);
  const [saved, setSaved] = useState(false);

  // Seeded once the profile lands, and re-seeded whenever the server's copy
  // changes underneath — after a save, or after a switch to another shop.
  useEffect(() => {
    if (shopProfile) {
      setForm({ name: shopProfile.name ?? "", ...profileFrom(shopProfile) });
      setPendingLogo(undefined);
    }
  }, [shopProfile]);

  if (isLoading || !form) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <p className="py-10 text-center text-gray-500 dark:text-gray-400 animate-pulse">
          Loading receipt settings…
        </p>
      </div>
    );
  }

  const name = form.name.trim();
  const isValid = name !== "";

  const pickLogo = (file, dataUrl) => {
    setSaved(false);
    setPendingLogo(file);
    setForm((current) => ({ ...current, logo_data_url: dataUrl }));
  };

  const change = (next) => {
    setSaved(false);
    setForm(next);
  };

  const save = async () => {
    if (!isValid || isMutating) return;

    setWarning(null);
    setSaved(false);

    const updated = await updateProfile({ name, ...profileBody(form) });
    if (!updated) return;

    // The logo is its own request, made after the profile save so that a
    // rejected image cannot also lose the address that was just typed.
    if (pendingLogo !== undefined) {
      const ok = pendingLogo ? await uploadLogo(pendingLogo) : await removeLogo();
      if (!ok) return;
      setPendingLogo(undefined);
    }

    // Stays on screen rather than closing anything — this is a page, not a
    // modal, and the sentence about the invoice prefix is the whole reason the
    // server bothers to send it.
    setWarning(updated.warning ?? null);
    setSaved(true);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-gray-800 dark:text-gray-100">
        Receipt Settings
      </h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
        What every receipt this shop prints carries at the top and the bottom.
      </p>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 transition-colors">
        {error && (
          <p role="alert" className={`${alertClass} mb-4`}>
            {error}
          </p>
        )}

        {mutationError && (
          <div role="alert" className={`${alertClass} mb-4`}>
            {mutationError}
          </div>
        )}

        {warning && (
          <div role="status" className={`${noticeClass} mb-4`}>
            {warning}
          </div>
        )}

        {saved && !warning && (
          <div
            role="status"
            className="rounded-md border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950 px-4 py-2 text-sm text-green-700 dark:text-green-300 mb-4"
          >
            Saved. New receipts print with these details.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div>
              <label className={labelClass} htmlFor="shop-settings-name">
                Shop Name
              </label>
              <input
                id="shop-settings-name"
                type="text"
                value={form.name}
                onChange={(e) => change({ ...form, name: e.target.value })}
                className={inputClass}
              />
            </div>

            <ShopProfileFields
              form={form}
              onChange={change}
              onPickLogo={pickLogo}
              idPrefix="shop-settings"
              disabled={isMutating}
            />

            <div className="pt-2">
              <button
                type="submit"
                disabled={!isValid || isMutating}
                className={submitButtonClass("bg-blue-600 hover:bg-blue-700")}
              >
                {isMutating ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>

          <ReceiptPreview
            shop={profilePreview(form, form.name)}
            className="lg:sticky lg:top-6 self-start"
          />
        </div>
      </div>
    </div>
  );
};

export default ShopSettings;
