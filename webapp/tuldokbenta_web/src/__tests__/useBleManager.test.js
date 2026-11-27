/**
 * Unit tests for useBleManager() and BleContext
 *
 * Feature: ble-receipt-printing
 * Validates: Requirements 2.1–2.8, 3.1–3.5, 6.1, 6.2
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useBleManager,
  HTTPS_REQUIRED_MESSAGE,
  NO_CHARACTERISTIC_MESSAGE,
} from "../hooks/useBleManager";
import { BleProvider, useBle } from "../context/BleContext";

const originalNavigator = globalThis.navigator;

function stubEnv({ bluetooth, isSecureContext = true }) {
  const nav = { ...originalNavigator };
  if (bluetooth === undefined) {
    delete nav.bluetooth;
  } else {
    nav.bluetooth = bluetooth;
  }
  vi.stubGlobal("navigator", nav);
  vi.stubGlobal("isSecureContext", isSecureContext);
}

/**
 * Create a fake Web Bluetooth device with configurable GATT profile resolution
 * and characteristic write methods.
 */
function createFakeDevice({
  name = "ThermalPrinter-58",
  profiles = { [0x18f0]: { [0x2af1]: {} } },
  connectError = null,
} = {}) {
  const listeners = new Map();

  const characteristicMap = new Map();
  for (const [svcKey, chars] of Object.entries(profiles)) {
    const svcUuid = Number(svcKey);
    const charEntries = new Map();
    for (const [charKey, charOverrides] of Object.entries(chars)) {
      const charObj = {
        writeValueWithoutResponse: vi.fn().mockResolvedValue(undefined),
        writeValue: vi.fn().mockResolvedValue(undefined),
        ...charOverrides,
      };
      charEntries.set(Number(charKey), charObj);
    }
    characteristicMap.set(svcUuid, charEntries);
  }

  const gatt = {
    connected: false,
    connect: vi.fn(async () => {
      if (connectError) throw connectError;
      gatt.connected = true;
      return gatt;
    }),
    disconnect: vi.fn(() => {
      gatt.connected = false;
    }),
    getPrimaryService: vi.fn(async (svcUuid) => {
      const chars = characteristicMap.get(svcUuid);
      if (!chars) throw new Error(`Service 0x${svcUuid.toString(16)} not found`);
      return {
        getCharacteristic: vi.fn(async (charUuid) => {
          const ch = chars.get(charUuid);
          if (!ch) throw new Error(`Characteristic 0x${charUuid.toString(16)} not found`);
          return ch;
        }),
      };
    }),
  };

  const device = {
    name,
    gatt,
    addEventListener: vi.fn((event, handler) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
    }),
    removeEventListener: vi.fn((event, handler) => {
      listeners.get(event)?.delete(handler);
    }),
    dispatchEvent(event) {
      for (const h of listeners.get(event) ?? []) h();
    },
    getCharacteristic(svcUuid, charUuid) {
      return characteristicMap.get(svcUuid)?.get(charUuid);
    },
  };

  return device;
}

describe("useBleManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // Environment detection & HTTPS enforcement (Req 6.1, 6.2)
  // -------------------------------------------------------------------------

  it("initialises as disconnected and supported when BLE is available in a secure context", () => {
    stubEnv({ bluetooth: { requestDevice: vi.fn() }, isSecureContext: true });

    const { result } = renderHook(() => useBleManager());

    expect(result.current.bleState).toBe("disconnected");
    expect(result.current.isSupported).toBe(true);
    expect(result.current.deviceName).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it("initialises as error with HTTPS message and never calls Bluetooth API when insecure", async () => {
    const requestDevice = vi.fn();
    stubEnv({ bluetooth: { requestDevice }, isSecureContext: false });

    const { result } = renderHook(() => useBleManager());

    expect(result.current.bleState).toBe("error");
    expect(result.current.errorMessage).toBe(HTTPS_REQUIRED_MESSAGE);
    expect(result.current.isSupported).toBe(false);

    await act(async () => {
      await result.current.connect();
    });

    expect(requestDevice).not.toHaveBeenCalled();
    expect(result.current.bleState).toBe("error");
  });

  it("initialises as disconnected (not error) when navigator.bluetooth is absent", async () => {
    stubEnv({ bluetooth: undefined, isSecureContext: true });

    const { result } = renderHook(() => useBleManager());

    expect(result.current.bleState).toBe("disconnected");
    expect(result.current.isSupported).toBe(false);
    expect(result.current.errorMessage).toBeNull();

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.bleState).toBe("disconnected");
  });

  // -------------------------------------------------------------------------
  // Device discovery & GATT profile resolution (Req 2.1–2.5, 2.8)
  // -------------------------------------------------------------------------

  it("calls requestDevice with filters for all three printer service UUIDs", async () => {
    const device = createFakeDevice();
    const requestDevice = vi.fn().mockResolvedValue(device);
    stubEnv({ bluetooth: { requestDevice }, isSecureContext: true });

    const { result } = renderHook(() => useBleManager());

    await act(async () => {
      await result.current.connect();
    });

    expect(requestDevice).toHaveBeenCalledTimes(1);
    const options = requestDevice.mock.calls[0][0];
    const filterServices = options.filters.flatMap((f) => f.services);
    expect(filterServices).toEqual(expect.arrayContaining([0x18f0, 0xff00, 0xffe0]));
    expect(result.current.bleState).toBe("connected");
    expect(result.current.deviceName).toBe("ThermalPrinter-58");
  });

  it("resolves GATT profiles in priority order and stops at the first matching pair", async () => {
    const device = createFakeDevice({
      name: "Xprinter-80",
      profiles: {
        [0xff00]: { [0xff02]: {} },
        [0xffe0]: { [0xffe1]: {} },
      },
    });
    stubEnv({
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
      isSecureContext: true,
    });

    const { result } = renderHook(() => useBleManager());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.bleState).toBe("connected");
    expect(result.current.deviceName).toBe("Xprinter-80");
    // Tried 0x18F0 (failed), then 0xFF00 (succeeded), and stopped before 0xFFE0.
    expect(device.gatt.getPrimaryService.mock.calls.map((c) => c[0])).toEqual([
      0x18f0,
      0xff00,
    ]);

    await act(async () => {
      await result.current.writeBytes(new Uint8Array([1, 2, 3]));
    });
    expect(
      device.getCharacteristic(0xff00, 0xff02).writeValueWithoutResponse,
    ).toHaveBeenCalledTimes(1);
    expect(
      device.getCharacteristic(0xffe0, 0xffe1).writeValueWithoutResponse,
    ).not.toHaveBeenCalled();
  });

  it("falls through to the third GATT profile (0xFFE0 / 0xFFE1) when earlier ones fail", async () => {
    const device = createFakeDevice({
      profiles: { [0xffe0]: { [0xffe1]: {} } },
    });
    stubEnv({
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
      isSecureContext: true,
    });

    const { result } = renderHook(() => useBleManager());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.bleState).toBe("connected");
    expect(device.gatt.getPrimaryService.mock.calls.map((c) => c[0])).toEqual([
      0x18f0,
      0xff00,
      0xffe0,
    ]);
  });

  it("transitions to error with a human-readable message when all GATT profiles fail", async () => {
    const device = createFakeDevice({ profiles: {} });
    stubEnv({
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
      isSecureContext: true,
    });

    const { result } = renderHook(() => useBleManager());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.bleState).toBe("error");
    expect(result.current.errorMessage).toBe(NO_CHARACTERISTIC_MESSAGE);
    expect(result.current.deviceName).toBeNull();
    expect(device.gatt.disconnect).toHaveBeenCalledTimes(1);
  });

  it("returns quietly to disconnected when the user cancels the device chooser", async () => {
    const cancelErr = new DOMException("User cancelled the requestDevice() chooser.", "NotFoundError");
    stubEnv({
      bluetooth: { requestDevice: vi.fn().mockRejectedValue(cancelErr) },
      isSecureContext: true,
    });

    const { result } = renderHook(() => useBleManager());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.bleState).toBe("disconnected");
    expect(result.current.errorMessage).toBeNull();
  });

  it("ignores concurrent connect() calls while already connecting", async () => {
    let resolveDevice;
    const devicePromise = new Promise((resolve) => {
      resolveDevice = resolve;
    });
    const requestDevice = vi.fn().mockReturnValue(devicePromise);
    stubEnv({ bluetooth: { requestDevice }, isSecureContext: true });

    const { result } = renderHook(() => useBleManager());

    let first;
    let second;
    await act(async () => {
      first = result.current.connect();
      second = result.current.connect();
      await Promise.resolve();
    });

    expect(result.current.bleState).toBe("connecting");
    expect(requestDevice).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveDevice(createFakeDevice());
      await Promise.all([first, second]);
    });

    expect(requestDevice).toHaveBeenCalledTimes(1);
    expect(result.current.bleState).toBe("connected");
  });

  // -------------------------------------------------------------------------
  // Disconnect, unexpected drops, reconnect, unmount (Req 2.6, 2.7)
  // -------------------------------------------------------------------------

  it("handles gattserverdisconnected by returning to disconnected and clearing characteristic", async () => {
    const device = createFakeDevice();
    stubEnv({
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
      isSecureContext: true,
    });

    const { result } = renderHook(() => useBleManager());

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.bleState).toBe("connected");

    act(() => {
      device.dispatchEvent("gattserverdisconnected");
    });

    expect(result.current.bleState).toBe("disconnected");
    expect(result.current.deviceName).toBeNull();
    await expect(
      result.current.writeBytes(new Uint8Array([0x0a])),
    ).rejects.toThrow(/No printer connected/i);
  });

  it("disconnect() removes listener, disconnects GATT, and resets state", async () => {
    const device = createFakeDevice();
    stubEnv({
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
      isSecureContext: true,
    });

    const { result } = renderHook(() => useBleManager());

    await act(async () => {
      await result.current.connect();
    });

    act(() => {
      result.current.disconnect();
    });

    expect(device.removeEventListener).toHaveBeenCalledWith(
      "gattserverdisconnected",
      expect.any(Function),
    );
    expect(device.gatt.disconnect).toHaveBeenCalledTimes(1);
    expect(result.current.bleState).toBe("disconnected");
    expect(result.current.deviceName).toBeNull();
  });

  it("releases the previous GATT connection before connecting to a new printer", async () => {
    const first = createFakeDevice({ name: "Printer-A" });
    const second = createFakeDevice({ name: "Printer-B" });
    const requestDevice = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    stubEnv({ bluetooth: { requestDevice }, isSecureContext: true });

    const { result } = renderHook(() => useBleManager());

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.deviceName).toBe("Printer-A");

    await act(async () => {
      await result.current.connect();
    });
    expect(first.gatt.disconnect).toHaveBeenCalledTimes(1);
    expect(first.removeEventListener).toHaveBeenCalledWith(
      "gattserverdisconnected",
      expect.any(Function),
    );
    expect(result.current.deviceName).toBe("Printer-B");
    expect(result.current.bleState).toBe("connected");
  });

  it("unmount removes the disconnect listener and calls gatt.disconnect()", async () => {
    const device = createFakeDevice();
    stubEnv({
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
      isSecureContext: true,
    });

    const { result, unmount } = renderHook(() => useBleManager());

    await act(async () => {
      await result.current.connect();
    });

    unmount();

    expect(device.removeEventListener).toHaveBeenCalledWith(
      "gattserverdisconnected",
      expect.any(Function),
    );
    expect(device.gatt.disconnect).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Chunked writes, retry fallback, error abort, serialisation (Req 3.1–3.5)
  // -------------------------------------------------------------------------

  it("writes bytes in configured chunks with the configured delay between chunks", async () => {
    vi.useFakeTimers();
    const device = createFakeDevice();
    stubEnv({
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
      isSecureContext: true,
    });

    const { result } = renderHook(() =>
      useBleManager({ chunkSize: 4, chunkDelayMs: 25 }),
    );

    await act(async () => {
      await result.current.connect();
    });

    const ch = device.getCharacteristic(0x18f0, 0x2af1);
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    let done = false;
    const writePromise = result.current.writeBytes(payload).then(() => {
      done = true;
    });

    // Chunk 1 sent immediately; waiting on the 25 ms timer before chunk 2.
    await act(async () => {
      await Promise.resolve();
    });
    expect(ch.writeValueWithoutResponse).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    // Advance 24 ms — still before chunk 2.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(24);
    });
    expect(ch.writeValueWithoutResponse).toHaveBeenCalledTimes(1);

    // Advance 1 ms → chunk 2 sent.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(ch.writeValueWithoutResponse).toHaveBeenCalledTimes(2);
    expect(done).toBe(false);

    // Advance 25 ms → chunk 3 sent and promise resolves with no trailing delay.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25);
    });
    await writePromise;
    expect(ch.writeValueWithoutResponse).toHaveBeenCalledTimes(3);
    expect(Array.from(ch.writeValueWithoutResponse.mock.calls[0][0])).toEqual([1, 2, 3, 4]);
    expect(Array.from(ch.writeValueWithoutResponse.mock.calls[1][0])).toEqual([5, 6, 7, 8]);
    expect(Array.from(ch.writeValueWithoutResponse.mock.calls[2][0])).toEqual([9]);
    expect(done).toBe(true);
  });

  it("retries a chunk with writeValue when writeValueWithoutResponse throws or is absent", async () => {
    const writeValueWithoutResponse = vi
      .fn()
      .mockRejectedValueOnce(new Error("not supported"))
      .mockResolvedValueOnce(undefined);
    const writeValue = vi.fn().mockResolvedValue(undefined);
    const device = createFakeDevice({
      profiles: {
        [0x18f0]: { [0x2af1]: { writeValueWithoutResponse, writeValue } },
      },
    });
    stubEnv({
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
      isSecureContext: true,
    });

    const { result } = renderHook(() =>
      useBleManager({ chunkSize: 2, chunkDelayMs: 0 }),
    );

    await act(async () => {
      await result.current.connect();
    });

    await act(async () => {
      await result.current.writeBytes(new Uint8Array([10, 20, 30]));
    });

    expect(writeValueWithoutResponse).toHaveBeenCalledTimes(2);
    expect(writeValue).toHaveBeenCalledTimes(1);
    expect(Array.from(writeValue.mock.calls[0][0])).toEqual([10, 20]);
    expect(result.current.bleState).toBe("connected");
  });

  it("uses writeValue directly when writeValueWithoutResponse is absent", async () => {
    const writeValue = vi.fn().mockResolvedValue(undefined);
    const device = createFakeDevice({
      profiles: {
        [0x18f0]: { [0x2af1]: { writeValueWithoutResponse: undefined, writeValue } },
      },
    });
    stubEnv({
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
      isSecureContext: true,
    });

    const { result } = renderHook(() =>
      useBleManager({ chunkSize: 10, chunkDelayMs: 0 }),
    );

    await act(async () => {
      await result.current.connect();
    });

    await act(async () => {
      await result.current.writeBytes(new Uint8Array([1, 2]));
    });

    expect(writeValue).toHaveBeenCalledTimes(1);
  });

  it("aborts remaining chunks, sets error state, and rejects when both write methods fail", async () => {
    const writeValueWithoutResponse = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("GATT disconnected"));
    const writeValue = vi
      .fn()
      .mockRejectedValueOnce(new Error("GATT disconnected"));
    const device = createFakeDevice({
      profiles: {
        [0x18f0]: { [0x2af1]: { writeValueWithoutResponse, writeValue } },
      },
    });
    stubEnv({
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
      isSecureContext: true,
    });

    const { result } = renderHook(() =>
      useBleManager({ chunkSize: 2, chunkDelayMs: 0 }),
    );

    await act(async () => {
      await result.current.connect();
    });

    let caught;
    await act(async () => {
      try {
        await result.current.writeBytes(new Uint8Array([1, 2, 3, 4, 5, 6]));
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    // Chunk 3 ([5, 6]) must not be attempted after chunk 2 failed.
    expect(writeValueWithoutResponse).toHaveBeenCalledTimes(2);
    expect(writeValue).toHaveBeenCalledTimes(1);
    expect(result.current.bleState).toBe("error");
    expect(result.current.errorMessage).toMatch(/GATT disconnected/i);
  });

  it("serialises concurrent writeBytes calls so chunks from two receipts never interleave", async () => {
    const written = [];
    const writeValueWithoutResponse = vi.fn(async (chunk) => {
      written.push(Array.from(chunk));
      await new Promise((r) => setTimeout(r, 5));
    });
    const device = createFakeDevice({
      profiles: { [0x18f0]: { [0x2af1]: { writeValueWithoutResponse } } },
    });
    stubEnv({
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
      isSecureContext: true,
    });

    const { result } = renderHook(() =>
      useBleManager({ chunkSize: 2, chunkDelayMs: 1 }),
    );

    await act(async () => {
      await result.current.connect();
    });

    await act(async () => {
      await Promise.all([
        result.current.writeBytes(new Uint8Array([1, 1, 2, 2])),
        result.current.writeBytes(new Uint8Array([9, 9, 8, 8])),
      ]);
    });

    expect(written).toEqual([
      [1, 1],
      [2, 2],
      [9, 9],
      [8, 8],
    ]);
  });
});

describe("BleContext / useBle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when useBle is called outside BleProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useBle())).toThrow(
      "useBle must be used inside BleProvider",
    );
    spy.mockRestore();
  });

  it("provides the BLE manager value inside BleProvider", () => {
    stubEnv({ bluetooth: undefined, isSecureContext: true });
    const wrapper = ({ children }) => React.createElement(BleProvider, null, children);
    const { result } = renderHook(() => useBle(), { wrapper });

    expect(result.current.bleState).toBe("disconnected");
    expect(result.current.isSupported).toBe(false);
    expect(typeof result.current.connect).toBe("function");
    expect(typeof result.current.disconnect).toBe("function");
    expect(typeof result.current.writeBytes).toBe("function");
  });
});
