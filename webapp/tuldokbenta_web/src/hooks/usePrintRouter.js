import { useCallback } from "react";
import { useBle } from "../context/BleContext";
import { buildEscPos } from "../utils/buildEscPos";
import { printInvoice } from "../utils/printInvoice";

/**
 * Single print entry point that routes receipts to a connected BLE thermal
 * printer or falls back transparently to the HTML popup tab (`printInvoice`).
 *
 * Never throws or rejects: all errors are caught internally and fall back to
 * the popup path so the cashier can always hand the customer a receipt.
 *
 * @returns {{ printReceipt: (sale: Object, shop?: Object) => Promise<void> }}
 */
export function usePrintRouter() {
  const { bleState, writeBytes } = useBle();

  const printReceipt = useCallback(
    (sale, shop) => {
      const invokePopup = () => {
        try {
          printInvoice(sale, shop);
        } catch (err) {
          console.error("usePrintRouter: popup fallback failed", err);
        }
      };

      // When not connected, invoke the popup synchronously inside the user's
      // click handler so browser popup blockers do not reject window.open().
      if (bleState !== "connected") {
        invokePopup();
        return Promise.resolve();
      }

      let bytes;
      try {
        bytes = buildEscPos(sale, shop);
      } catch (err) {
        console.warn("usePrintRouter: ESC/POS build failed, falling back to popup", err);
        invokePopup();
        return Promise.resolve();
      }

      try {
        return Promise.resolve(writeBytes(bytes)).catch((err) => {
          console.warn("usePrintRouter: BLE write failed, falling back to popup", err);
          invokePopup();
        });
      } catch (err) {
        console.warn("usePrintRouter: BLE write threw synchronously, falling back to popup", err);
        invokePopup();
        return Promise.resolve();
      }
    },
    [bleState, writeBytes],
  );

  return { printReceipt };
}
