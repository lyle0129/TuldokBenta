// components/admin/ShopProfileFields.jsx
import LogoField from "../shared/LogoField";
import { labelClass, inputClass } from "../shared/fieldStyles";

/**
 * The receipt profile fields, shared by the add and edit modals and by the
 * manager-facing shop settings page.
 *
 * The form-state helpers these pair with live in utils/shopProfile.js. These are
 * the columns a receipt prints, so anything changed here shows up immediately in
 * the ReceiptPreview beside them.
 *
 * `onPickLogo` is separate from `onChange` because a file input carries its value
 * on `e.target.files`, not `e.target.value`, so it cannot go through the `set`
 * helper below — and because the File itself has to reach the caller, which
 * uploads it, while only its data URI belongs in the form.
 */
const ShopProfileFields = ({ form, onChange, onPickLogo, idPrefix, disabled = false }) => {
  const field = (key) => `${idPrefix}-${key}`;
  const set = (key) => (e) => onChange({ ...form, [key]: e.target.value });

  return (
    <>
      <div>
        <label className={labelClass} htmlFor={field("address")}>
          Address
        </label>
        <input
          id={field("address")}
          type="text"
          value={form.address_line}
          onChange={set("address_line")}
          placeholder="e.g. 12 Rizal St, Barangay Poblacion"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor={field("contact")}>
          Contact Number
        </label>
        <input
          id={field("contact")}
          type="text"
          value={form.contact_number}
          onChange={set("contact_number")}
          placeholder="e.g. 0917 123 4567"
          className={inputClass}
        />
      </div>

      <LogoField
        dataUrl={form.logo_data_url}
        fallbackUrl={form.logo_url}
        onPick={onPickLogo}
        disabled={disabled}
        idPrefix={field("logo")}
      />

      <div>
        <label className={labelClass} htmlFor={field("footer")}>
          Receipt Footer
        </label>
        <input
          id={field("footer")}
          type="text"
          value={form.receipt_footer}
          onChange={set("receipt_footer")}
          placeholder="Thank you for your purchase!"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor={field("width")}>
            Receipt Width (mm)
          </label>
          <input
            id={field("width")}
            type="number"
            min="20"
            max="210"
            value={form.receipt_paper_width_mm}
            onChange={set("receipt_paper_width_mm")}
            className={inputClass}
          />
          {/* The two thermal rolls in the wild. The server accepts 20–210, wide
              enough not to argue with anybody's printer. */}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            58 for a thermal roll, 80 for the wider one.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor={field("prefix")}>
            Invoice Prefix
          </label>
          <input
            id={field("prefix")}
            type="text"
            maxLength={10}
            value={form.invoice_prefix}
            onChange={set("invoice_prefix")}
            className={`${inputClass} font-mono`}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Receipts read {form.invoice_prefix || "INV-"}0001, 0002, …
          </p>
        </div>
      </div>
    </>
  );
};

export default ShopProfileFields;
