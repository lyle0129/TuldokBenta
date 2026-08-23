// components/admin/ShopProfileFields.jsx
import { labelClass, inputClass } from "../shared/fieldStyles";

/**
 * The receipt profile fields, shared by the add and edit modals.
 *
 * The form-state helpers these pair with live in utils/shopProfile.js.
 *
 * These columns are what ticket 09 will print receipts from. Until then they
 * are recorded and unused, which is fine — a shop created now should not need
 * revisiting when that lands.
 */
const ShopProfileFields = ({ form, onChange, idPrefix }) => {
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

      <div>
        <label className={labelClass} htmlFor={field("logo")}>
          Logo URL
        </label>
        <input
          id={field("logo")}
          type="text"
          value={form.logo_url}
          onChange={set("logo_url")}
          placeholder="https://…"
          className={inputClass}
        />
      </div>

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
