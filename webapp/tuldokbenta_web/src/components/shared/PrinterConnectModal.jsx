// components/shared/PrinterConnectModal.jsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Printer } from "lucide-react";
import { useBle } from "../../context/BleContext";
import Modal from "./Modal";
import PrinterConnectUI from "./PrinterConnectUI";
import { cancelButtonClass } from "./fieldStyles";

/**
 * Navbar trigger button for the Bluetooth receipt printer modal.
 *
 * Shows a live status dot reflecting the session BLE state so cashiers can see
 * at a glance whether prints will go straight to Bluetooth or fall back to the
 * popup receipt tab.
 */
export const PrinterNavButton = ({ open, onClick }) => {
  const { bleState, deviceName } = useBle();

  const isConnected = bleState === "connected";
  const isConnecting = bleState === "connecting";
  const isError = bleState === "error";

  const dotClass = isConnected
    ? "bg-green-500"
    : isConnecting
      ? "bg-amber-500 animate-pulse"
      : isError
        ? "bg-red-500"
        : "bg-gray-400 dark:bg-gray-500";

  const statusTitle = isConnected
    ? `Printer connected: ${deviceName || "BLE printer"}`
    : isConnecting
      ? "Connecting to printer…"
      : isError
        ? "Printer connection error"
        : "No printer connected";

  const triggerTone = open
    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
    : isConnected
      ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50"
      : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700";

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label="Printer"
      title={statusTitle}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 md:px-3 min-h-11 rounded-md text-sm font-medium transition-colors cursor-pointer ${triggerTone}`}
    >
      <span className="relative inline-flex items-center">
        <Printer size={17} aria-hidden="true" />
        <span
          data-testid="printer-status-dot"
          data-ble-state={bleState}
          aria-hidden="true"
          className={`absolute -top-0.5 -right-1 w-2 h-2 rounded-full ring-2 ring-white dark:ring-gray-900 ${dotClass}`}
        />
      </span>
      <span className="hidden sm:inline">Printer</span>
    </button>
  );
};

/**
 * Bluetooth thermal printer connection dialog, rendered inside the shared
 * `<Modal>` shell so it matches every other dialog in the app (blurred
 * backdrop, purple top accent, Escape/backdrop dismiss, and body scroll lock).
 *
 * Mounted as a sibling of `<nav>` in Navbar.jsx — never inside `<nav>` —
 * because `<nav>` sets `backdrop-blur`, which would trap `fixed inset-0`.
 */
const PrinterConnectModal = ({ open, onClose }) => {
  const { pathname } = useLocation();

  useEffect(() => {
    if (open) onClose();
    // Same rationale as NavDrawer: close only when the route actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Receipt Printer"
      accent="purple"
      size="md"
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={cancelButtonClass}>
            Close
          </button>
        </div>
      }
    >
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Pair a Bluetooth thermal printer to print receipts directly. When no
        printer is connected, receipts open in a print tab instead.
      </p>

      <PrinterConnectUI />
    </Modal>
  );
};

export default PrinterConnectModal;
