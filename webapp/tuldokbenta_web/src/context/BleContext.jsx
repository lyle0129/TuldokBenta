import { createContext, useContext } from "react";
import { useBleManager } from "../hooks/useBleManager";

/**
 * Session-lifetime BLE printer context.
 *
 * Mounted once inside AppShell so a printer connected on one page (e.g. Open
 * Sales) stays connected when the cashier navigates to another (e.g. Closed
 * Sales or Offline Sales).
 */
// eslint-disable-next-line react-refresh/only-export-components
export const BleContext = createContext(null);

export const BleProvider = ({ children }) => {
  const ble = useBleManager();
  return <BleContext.Provider value={ble}>{children}</BleContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useBle = () => {
  const ctx = useContext(BleContext);
  if (!ctx) {
    throw new Error("useBle must be used inside BleProvider");
  }
  return ctx;
};
