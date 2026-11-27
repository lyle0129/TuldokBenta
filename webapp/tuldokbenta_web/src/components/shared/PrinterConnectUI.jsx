import { Bluetooth, Loader2, Printer } from "lucide-react";
import { useBle } from "../../context/BleContext";

/**
 * Compact BLE thermal printer status and Connect/Disconnect control.
 *
 * Reads all state from `BleContext`, so placing this component on multiple
 * pages shares one session-lifetime printer connection without duplicating
 * connection logic.
 *
 * @param {object} [props]
 * @param {string} [props.className] Additional wrapper classes.
 */
const PrinterConnectUI = ({ className = "" }) => {
  const {
    bleState,
    deviceName,
    errorMessage,
    isSupported,
    connect,
    disconnect,
  } = useBle();

  const isConnecting = bleState === "connecting";
  const isConnected = bleState === "connected";
  const isError = bleState === "error";

  const dotClass = isConnected
    ? "bg-green-500"
    : isConnecting
      ? "bg-amber-500 animate-pulse"
      : isError
        ? "bg-red-500"
        : "bg-gray-400 dark:bg-gray-500";

  const renderStatusText = () => {
    if (!isSupported && !isError) {
      return (
        <span className="text-gray-500 dark:text-gray-400">
          BLE printing is not available in this browser
        </span>
      );
    }
    if (isConnected) {
      return (
        <span className="font-medium text-green-700 dark:text-green-400">
          {deviceName || "Connected printer"}
        </span>
      );
    }
    if (isConnecting) {
      return (
        <span className="text-amber-700 dark:text-amber-400">Connecting…</span>
      );
    }
    if (isError) {
      return (
        <span className="text-red-700 dark:text-red-400">
          Connection error{errorMessage ? `: ${errorMessage}` : ""}
        </span>
      );
    }
    return (
      <span className="text-gray-600 dark:text-gray-300">
        No printer connected
      </span>
    );
  };

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm text-sm ${className}`.trim()}
    >
      <div
        aria-live="polite"
        className="flex items-center gap-2 min-w-0"
      >
        <Printer
          className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400"
          aria-hidden="true"
        />
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`}
          aria-hidden="true"
        />
        <span className="truncate">{renderStatusText()}</span>
      </div>

      {isSupported && (
        <div className="shrink-0">
          {isConnected ? (
            <button
              type="button"
              onClick={disconnect}
              aria-label="Disconnect printer"
              className="inline-flex items-center gap-1.5 px-3 min-h-9 rounded-md text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={connect}
              disabled={isConnecting}
              aria-label="Connect printer"
              aria-busy={isConnecting || undefined}
              className="inline-flex items-center gap-1.5 px-3 min-h-9 rounded-md text-xs font-medium bg-purple-600 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
            >
              {isConnecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Bluetooth className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              Connect printer
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PrinterConnectUI;
