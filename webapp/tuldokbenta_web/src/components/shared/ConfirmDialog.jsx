// components/shared/ConfirmDialog.jsx
import Modal from "./Modal";

/** The confirm button follows the dialog's accent, so a destructive yes reads as one. */
const CONFIRM_BUTTON = {
  yellow: "bg-yellow-500 hover:bg-yellow-600",
  red: "bg-red-600 hover:bg-red-700",
  green: "bg-green-600 hover:bg-green-700",
  blue: "bg-blue-600 hover:bg-blue-700",
  purple: "bg-purple-600 hover:bg-purple-700",
};

/**
 * A yes/no dialog. Cancel comes first in the DOM and last visually on mobile
 * (`flex-col-reverse`), so the safe choice sits under the thumb.
 */
const ConfirmDialog = ({
  open,
  title,
  message,
  details = null,
  confirmLabel = "Confirm",
  cancelLabel = "Go Back",
  accent = "yellow",
  onConfirm,
  onCancel,
}) => (
  <Modal open={open} onClose={onCancel} title={title} accent={accent} size="md">
    <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 whitespace-pre-line">
      {message}
    </p>

    {details?.length > 0 && (
      <ul className="mt-3 space-y-1 rounded-md bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {details.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    )}

    <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2.5 min-h-11 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className={`px-4 py-2.5 min-h-11 rounded-md text-white font-medium transition-colors ${
          CONFIRM_BUTTON[accent] ?? CONFIRM_BUTTON.yellow
        }`}
      >
        {confirmLabel}
      </button>
    </div>
  </Modal>
);

export default ConfirmDialog;
