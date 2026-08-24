// components/shared/LogoField.jsx
import { useRef, useState } from "react";
import {
  ALLOWED_LOGO_MIME,
  MAX_LOGO_BYTES,
  formatKb,
  readAsDataUrl,
  logoRejection,
} from "../../utils/logoFile";
import { labelClass, alertClass } from "./fieldStyles";

/**
 * Choosing, previewing and clearing a shop's receipt logo.
 *
 * The image is uploaded as bytes rather than linked, so that a receipt carries
 * it inline: a print popup's <img> can send no auth header, and an offline till
 * has nothing to fetch a URL over.
 *
 * @param {string}  dataUrl       the current or newly picked image, as a data URI
 * @param {string}  fallbackUrl   a legacy logo_url, shown only when there is no upload
 * @param {(file: File|null, dataUrl: string) => void} onPick
 *   the picked file and its data URI, or (null, "") when cleared
 * @param {boolean} disabled
 */
const LogoField = ({
  dataUrl = "",
  fallbackUrl = "",
  onPick,
  disabled = false,
  idPrefix = "logo",
}) => {
  const inputRef = useRef(null);
  const [error, setError] = useState(null);

  const shown = dataUrl || fallbackUrl;
  const isLegacyLink = !dataUrl && Boolean(fallbackUrl);

  const choose = async (event) => {
    const file = event.target.files?.[0];
    // Reset immediately so picking the same file twice in a row still fires.
    event.target.value = "";
    if (!file) return;

    const rejection = logoRejection(file);
    if (rejection) {
      setError(rejection);
      return;
    }

    setError(null);

    try {
      onPick(file, await readAsDataUrl(file));
    } catch {
      setError("That image could not be read.");
    }
  };

  const clear = () => {
    setError(null);
    onPick(null, "");
  };

  return (
    <div>
      <span className={labelClass}>Receipt Logo</span>

      <div className="flex items-center gap-4">
        <div className="w-20 h-20 flex-shrink-0 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 flex items-center justify-center overflow-hidden">
          {shown ? (
            <img
              src={shown}
              alt="Receipt logo"
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">None</span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            id={`${idPrefix}-file`}
            type="file"
            accept={ALLOWED_LOGO_MIME.join(",")}
            onChange={choose}
            disabled={disabled}
            className="hidden"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="px-3 min-h-11 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
            >
              {shown ? "Replace…" : "Upload…"}
            </button>

            {dataUrl && (
              <button
                type="button"
                onClick={clear}
                disabled={disabled}
                className="px-3 min-h-11 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900 transition-colors disabled:opacity-60"
              >
                Remove
              </button>
            )}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            PNG, JPEG or WebP, up to {formatKb(MAX_LOGO_BYTES)}.
          </p>
        </div>
      </div>

      {/* A shop configured before uploads existed. Worth saying out loud: the
          receipt still prints, but it depends on that host answering, and a till
          with no connection will not see it at all. */}
      {isLegacyLink && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Currently printing a linked image. Uploading one replaces it and makes
          the logo work offline.
        </p>
      )}

      {error && (
        <div role="alert" className={`${alertClass} mt-2`}>
          {error}
        </div>
      )}
    </div>
  );
};

export default LogoField;
