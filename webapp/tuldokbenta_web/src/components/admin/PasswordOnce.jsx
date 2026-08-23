// components/admin/PasswordOnce.jsx
import { useState } from "react";
import { Copy, Check, RefreshCw } from "lucide-react";
import { labelClass, inputClass, noticeClass } from "../shared/fieldStyles";
import { generatePassword } from "../../utils/generatePassword";

/**
 * The password field, plus a Generate button.
 *
 * The server's floor is 8 characters (assertPasswordPolicy); the counter below
 * says so rather than letting the admin discover it as a 400.
 */
export const PasswordField = ({ value, onChange, id, label = "Password" }) => (
  <div>
    <label className={labelClass} htmlFor={id}>
      {label}
    </label>
    <div className="flex gap-2">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} font-mono`}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => onChange(generatePassword())}
        className="flex items-center justify-center gap-1.5 px-4 min-h-11 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition flex-shrink-0"
      >
        <RefreshCw size={16} aria-hidden="true" />
        Generate
      </button>
    </div>
    {/* Shown rather than hidden behind a dot mask: the admin is typing a
        password FOR somebody else and has to be able to read it back to them. */}
    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
      At least 8 characters. Shown in the clear because you are handing it over.
    </p>
  </div>
);

/**
 * The password, once.
 *
 * Requirement 3.10. The API never returns a password after it is set — the
 * value here is the one this browser just sent — so once this panel is
 * dismissed the string exists nowhere but in the recipient's hands. Saying that
 * plainly is the difference between an admin who writes it down and one who
 * closes the dialog and calls support.
 */
const PasswordOnce = ({ password, username }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A denied clipboard permission or an insecure origin. The password is on
      // screen and selectable either way, so there is nothing to report.
    }
  };

  return (
    <div className="space-y-4">
      <div className={noticeClass} role="status">
        This is the only time this password will be shown. Hand it to{" "}
        <span className="font-semibold">{username}</span> now — they will be asked
        to change it the first time they sign in.
      </div>

      <div>
        <span className={labelClass}>Password</span>
        <div className="flex gap-2">
          <code className="flex-1 min-h-11 flex items-center px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-base break-all select-all">
            {password}
          </code>
          <button
            type="button"
            onClick={copy}
            className="flex items-center justify-center gap-1.5 px-4 min-h-11 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition flex-shrink-0"
          >
            {copied ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PasswordOnce;
