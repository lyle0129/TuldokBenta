// components/shared/Modal.jsx
import { useEffect, useRef } from "react";

/**
 * The one overlay every dialog in the app renders inside.
 *
 * The same `fixed inset-0 … backdrop-blur-sm` recipe used to be copy-pasted
 * into eleven components, none of which handled Escape, backdrop clicks, body
 * scroll lock, or `role="dialog"`. Centralising it means a phone-sized fix
 * lands everywhere at once.
 */

const ACCENTS = {
  blue: "border-blue-600",
  green: "border-green-600",
  yellow: "border-yellow-500",
  purple: "border-purple-500",
  red: "border-red-600",
  gray: "border-gray-400",
};

const SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-2xl",
};

/**
 * Body scroll lock, counted across every dialog rather than saved and restored
 * by each one.
 *
 * Each Modal used to capture `document.body.style.overflow` when it opened and
 * write that value back when it closed. Dialogs in this app overlap — an edit
 * sheet and its confirm prompt, the cart and its unclaimed-freebie warning — and
 * the second to open captured "hidden" from the first. Whichever unmounted last
 * then wrote "hidden" back, and the page stayed unscrollable until a reload.
 *
 * With a count, only the first dialog stores the real value and only the last
 * one out restores it, so the order they close in stops mattering.
 */
let openCount = 0;
let overflowBeforeLock = "";

const lockBodyScroll = () => {
  if (openCount === 0) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  openCount += 1;

  return () => {
    // Floored: a count that ever went negative would leave the page locked for
    // the rest of the session, which is the bug this replaced.
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) document.body.style.overflow = overflowBeforeLock;
  };
};

const Modal = ({
  open,
  onClose,
  title,
  accent = "blue",
  size = "md",
  // "sheet" fills the screen on a phone and only becomes a centred dialog from
  // `sm:` up — the app is used mostly on mobile, where a centred card with a
  // scrolling body wastes most of the viewport.
  variant = "center",
  closeOnBackdrop = true,
  children,
  footer,
}) => {
  const panelRef = useRef(null);

  // Escape closes.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // The page behind stops scrolling while a dialog is up.
  //
  // Kept apart from the Escape listener, and deliberately depending on `open`
  // alone: most callers pass an inline arrow as `onClose`, so a shared effect
  // tears down and re-runs on every render of the parent, releasing and
  // retaking the lock each time.
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const isSheet = variant === "sheet";

  return (
    <div
      className={`fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-50 flex ${
        isSheet ? "items-stretch sm:items-center" : "items-center px-4"
      } justify-center`}
      onMouseDown={(e) => {
        // Only a click that starts on the backdrop closes — dragging a text
        // selection out of the panel shouldn't dismiss the dialog.
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={`bg-white dark:bg-gray-900 border-t-4 ${
          ACCENTS[accent] ?? ACCENTS.blue
        } shadow-xl w-full ${SIZES[size] ?? SIZES.md} flex flex-col outline-none ${
          isSheet
            ? "h-full sm:h-auto sm:max-h-[85vh] rounded-none sm:rounded-2xl"
            : "max-h-[90vh] rounded-2xl"
        }`}
      >
        {title && (
          <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-100">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 px-3 py-1 text-2xl leading-none text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              &times;
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4">{children}</div>

        {footer && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-5 sm:px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
