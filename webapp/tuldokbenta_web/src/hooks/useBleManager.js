// hooks/useBleManager.js
import { useCallback, useEffect, useRef, useState } from "react";
import { chunkBytes } from "../utils/buildEscPos";

/**
 * GATT (service, characteristic) pairs tried in priority order when resolving
 * a writable printer characteristic. The first pair that resolves is used.
 */
export const GATT_PROFILES = [
  { serviceUuid: 0x18f0, characteristicUuid: 0x2af1 }, // Common thermal printer
  { serviceUuid: 0xff00, characteristicUuid: 0xff02 }, // Zicox / Xprinter
  { serviceUuid: 0xffe0, characteristicUuid: 0xffe1 }, // Generic serial over BLE
];

const SERVICE_UUIDS = GATT_PROFILES.map((p) => p.serviceUuid);

export const NO_CHARACTERISTIC_MESSAGE =
  "No compatible printer characteristic found. Try a different printer or reconnect.";
export const HTTPS_REQUIRED_MESSAGE = "Web Bluetooth requires HTTPS";

/** Resolve after `ms` milliseconds. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Read Web Bluetooth availability and the secure-context flag.
 *
 * Module-scope so the lazy `useState` initialisers stay one-liners and the
 * detection runs only on the first render of each mount.
 *
 * @returns {{ hasBluetooth: boolean, secureContext: boolean }}
 */
function readEnvironment() {
  const hasBluetooth =
    typeof navigator !== "undefined" && navigator.bluetooth != null;
  const secureContext =
    typeof window !== "undefined" ? Boolean(window.isSecureContext) : false;
  return { hasBluetooth, secureContext };
}

/** Call `fn`, swallowing anything it throws. Teardown must never throw. */
const quietly = (fn) => {
  try {
    fn();
  } catch {
    /* ignore */
  }
};

/**
 * Web Bluetooth connection lifecycle hook.
 *
 * Owns device discovery, the GATT connection, characteristic resolution,
 * chunked writes, and disconnect cleanup. It is meant to live once inside
 * `BleProvider` so a printer connected on one page stays connected when the
 * user navigates to another.
 *
 * State machine:
 * ```
 * disconnected ──[connect()]──► connecting ──[GATT resolved]──► connected
 *      ▲                            │                               │
 *      │                        [all fail]                  [gattserverdisconnected]
 *      │                            ▼                         [disconnect()]
 *      └─────────────────────── error ◄──[write fails]────────────┘
 * ```
 * Cancelling the browser's device chooser returns to `disconnected` without an
 * error — the cashier changed their mind, nothing failed.
 *
 * @param {object} [options]
 * @param {number} [options.chunkSize=100]   Max bytes written per GATT write.
 * @param {number} [options.chunkDelayMs=25] Delay between consecutive writes.
 * @returns {{
 *   bleState: ("disconnected"|"connecting"|"connected"|"error"),
 *   deviceName: string|null,
 *   errorMessage: string|null,
 *   isSupported: boolean,
 *   connect: () => Promise<void>,
 *   disconnect: () => void,
 *   writeBytes: (bytes: Uint8Array) => Promise<void>,
 * }}
 */
export function useBleManager({ chunkSize = 100, chunkDelayMs = 25 } = {}) {
  // Initial state is derived from the environment once, so the very first
  // render already reflects "BLE requires HTTPS" or "BLE unavailable" with no
  // flash through a disconnected state. No Bluetooth API is touched here.
  const [bleState, setBleState] = useState(() => {
    const { hasBluetooth, secureContext } = readEnvironment();
    return hasBluetooth && !secureContext ? "error" : "disconnected";
  });
  const [deviceName, setDeviceName] = useState(null);
  const [errorMessage, setErrorMessage] = useState(() => {
    const { hasBluetooth, secureContext } = readEnvironment();
    return hasBluetooth && !secureContext ? HTTPS_REQUIRED_MESSAGE : null;
  });
  // isSupported never changes during a session, so it has no setter.
  const [isSupported] = useState(() => {
    const { hasBluetooth, secureContext } = readEnvironment();
    return hasBluetooth && secureContext;
  });

  // Mutable values that must not trigger re-renders.
  const activeCharacteristicRef = useRef(null);
  const deviceRef = useRef(null);
  const gattRef = useRef(null);
  const connectingRef = useRef(false);
  const disconnectHandlerRef = useRef(null);
  // Tail of the write queue. Every writeBytes call chains onto it, so two quick
  // Print taps print two receipts one after the other instead of interleaving
  // their chunks into garbage.
  const writeQueueRef = useRef(Promise.resolve());

  /**
   * Drop the current device: stop listening for its disconnect event (so our
   * own gatt.disconnect() does not re-enter the handler), close the GATT
   * connection, and forget every reference. Does not touch React state.
   */
  const releaseDevice = useCallback(() => {
    const device = deviceRef.current;
    const handler = disconnectHandlerRef.current;
    if (device && handler && typeof device.removeEventListener === "function") {
      quietly(() => device.removeEventListener("gattserverdisconnected", handler));
    }
    const gatt = gattRef.current;
    if (gatt && typeof gatt.disconnect === "function") {
      quietly(() => gatt.disconnect());
    }
    activeCharacteristicRef.current = null;
    gattRef.current = null;
    deviceRef.current = null;
    disconnectHandlerRef.current = null;
  }, []);

  /**
   * Connect to a BLE printer the user picks from the browser chooser.
   *
   * A no-op when Web Bluetooth is unsupported (absent, or not a secure
   * context) and while a connection is already in flight. Never rejects: the
   * outcome is reported through `bleState` / `errorMessage`.
   *
   * @returns {Promise<void>}
   */
  const connect = useCallback(async () => {
    if (!isSupported) return; // Req 6.1: never call a Bluetooth API here.
    if (connectingRef.current) return; // Req 2.8: no second requestDevice.
    connectingRef.current = true;

    // Reconnecting (e.g. to a different printer) must not leave the old GATT
    // connection open behind the new one.
    releaseDevice();
    setDeviceName(null);
    setBleState("connecting");
    setErrorMessage(null);

    let device = null;

    try {
      device = await navigator.bluetooth.requestDevice({
        // Separate filter objects give OR semantics: a device advertising any
        // one of the known service UUIDs is offered.
        filters: SERVICE_UUIDS.map((uuid) => ({ services: [uuid] })),
        // Grants access to every profile we try, whichever filter matched.
        optionalServices: SERVICE_UUIDS,
      });

      /**
       * Fires when the printer drops the GATT connection on its own. Clears
       * the stored characteristic and returns to `"disconnected"`.
       */
      const handler = () => {
        activeCharacteristicRef.current = null;
        gattRef.current = null;
        setBleState("disconnected");
        setDeviceName(null);
      };
      device.addEventListener("gattserverdisconnected", handler);
      disconnectHandlerRef.current = handler;
      deviceRef.current = device;

      const gatt = device.gatt;
      gattRef.current = gatt;
      await gatt.connect();

      // Try each GATT profile in order; the first that resolves wins.
      let resolvedCharacteristic = null;
      for (const profile of GATT_PROFILES) {
        try {
          const service = await gatt.getPrimaryService(profile.serviceUuid);
          resolvedCharacteristic = await service.getCharacteristic(
            profile.characteristicUuid,
          );
          break;
        } catch {
          // This profile did not resolve; try the next one.
        }
      }

      if (!resolvedCharacteristic) {
        throw new Error(NO_CHARACTERISTIC_MESSAGE);
      }

      activeCharacteristicRef.current = resolvedCharacteristic;
      setDeviceName(device.name || null);
      setBleState("connected");
    } catch (err) {
      // Tear down anything that was partially set up.
      releaseDevice();
      setDeviceName(null);

      // requestDevice rejects with NotFoundError when the chooser is
      // cancelled. Only treat it as a cancel when no device was picked yet.
      if (device === null && err?.name === "NotFoundError") {
        setErrorMessage(null);
        setBleState("disconnected");
      } else {
        setErrorMessage(err?.message || "Failed to connect to printer");
        setBleState("error");
      }
    } finally {
      connectingRef.current = false;
    }
  }, [isSupported, releaseDevice]);

  /**
   * Actively disconnect from the current printer and reset to `"disconnected"`.
   */
  const disconnect = useCallback(() => {
    releaseDevice();
    setDeviceName(null);
    setErrorMessage(null);
    setBleState("disconnected");
  }, [releaseDevice]);

  /**
   * Write one receipt's bytes, chunk by chunk. See `writeBytes`.
   *
   * @param {Uint8Array} bytes
   * @returns {Promise<void>}
   */
  const writeNow = useCallback(
    async (bytes) => {
      const characteristic = activeCharacteristicRef.current;
      if (!characteristic) {
        throw new Error("No printer connected");
      }

      const chunks = chunkBytes(bytes, chunkSize);

      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];

        try {
          // Prefer writeValueWithoutResponse; if it is absent or throws, retry
          // the chunk once with writeValue.
          if (typeof characteristic.writeValueWithoutResponse === "function") {
            try {
              await characteristic.writeValueWithoutResponse(chunk);
            } catch {
              if (typeof characteristic.writeValue !== "function") {
                throw new Error("Characteristic has no writable method");
              }
              await characteristic.writeValue(chunk);
            }
          } else if (typeof characteristic.writeValue === "function") {
            await characteristic.writeValue(chunk);
          } else {
            throw new Error("Characteristic has no writable method");
          }
        } catch (err) {
          // Abort the remaining chunks and surface the failure.
          setErrorMessage(
            `Failed to write to printer: ${err?.message || "unknown error"}`,
          );
          setBleState("error");
          throw err;
        }

        // Pause between chunks, but not after the last one.
        if (i < chunks.length - 1) {
          await sleep(chunkDelayMs);
        }
      }
    },
    [chunkSize, chunkDelayMs],
  );

  /**
   * Write ESC/POS bytes to the connected printer, splitting the array into
   * chunks of at most `chunkSize` bytes and pausing `chunkDelayMs` between
   * them.
   *
   * Each chunk is written with `writeValueWithoutResponse`, falling back to
   * `writeValue` when that method is absent or throws. A chunk that cannot be
   * written after the fallback sets `bleState` to `"error"` and rejects, so the
   * print router can fall back to the popup path.
   *
   * Calls are serialised: a second call waits for the first to finish (or
   * fail) before its first chunk is sent.
   *
   * @param {Uint8Array} bytes  ESC/POS byte array to send.
   * @returns {Promise<void>}  Resolves when every chunk has been written.
   * @throws {Error} When no characteristic is connected, or a chunk write fails
   *   after the `writeValue` fallback.
   */
  const writeBytes = useCallback(
    (bytes) => {
      const run = writeQueueRef.current.then(() => writeNow(bytes));
      // The queue must survive a failed print, or every later print would
      // reject without being attempted.
      writeQueueRef.current = run.catch(() => {});
      return run;
    },
    [writeNow],
  );

  // On unmount: stop listening and release the GATT connection so the printer
  // is not left hanging. releaseDevice is stable, so this runs once.
  useEffect(() => releaseDevice, [releaseDevice]);

  return {
    bleState,
    deviceName,
    errorMessage,
    isSupported,
    connect,
    disconnect,
    writeBytes,
  };
}
