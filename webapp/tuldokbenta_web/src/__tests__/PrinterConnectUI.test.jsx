/**
 * Property-based and unit tests for PrinterConnectUI
 *
 * Feature: ble-receipt-printing
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import fc from "fast-check";
import PrinterConnectUI from "../components/shared/PrinterConnectUI";
import { useBle } from "../context/BleContext";

vi.mock("../context/BleContext", () => ({
  useBle: vi.fn(),
}));

function mockBle(overrides = {}) {
  const value = {
    bleState: "disconnected",
    deviceName: null,
    errorMessage: null,
    isSupported: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    writeBytes: vi.fn(),
    ...overrides,
  };
  useBle.mockReturnValue(value);
  return value;
}

describe("PrinterConnectUI — Property 7: interactive controls have aria-labels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("every rendered button has a non-empty aria-label across all BLE states", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("disconnected", "connecting", "connected", "error"),
        fc.boolean(),
        fc.option(fc.string({ minLength: 1, maxLength: 24 })),
        fc.option(fc.string({ minLength: 1, maxLength: 40 })),
        (bleState, isSupported, deviceName, errorMessage) => {
          mockBle({ bleState, isSupported, deviceName, errorMessage });
          const { container } = render(<PrinterConnectUI />);

          const buttons = container.querySelectorAll("button");
          for (const btn of buttons) {
            const label = btn.getAttribute("aria-label");
            expect(label).toBeTruthy();
            expect(label.trim().length).toBeGreaterThan(0);
          }

          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("PrinterConnectUI — unit examples", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'No printer connected' and 'Connect printer' button in disconnected state", () => {
    mockBle({ bleState: "disconnected", isSupported: true });
    render(<PrinterConnectUI />);

    expect(screen.getByText("No printer connected")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Connect printer" });
    expect(btn).toBeEnabled();
  });

  it("renders device name and 'Disconnect' button in connected state", () => {
    mockBle({
      bleState: "connected",
      deviceName: "RPP02N-58mm",
      isSupported: true,
    });
    render(<PrinterConnectUI />);

    expect(screen.getByText("RPP02N-58mm")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Disconnect printer" });
    expect(btn).toHaveTextContent("Disconnect");
    expect(btn).toBeEnabled();
  });

  it("renders 'Connecting…' and a disabled button in connecting state", () => {
    mockBle({ bleState: "connecting", isSupported: true });
    render(<PrinterConnectUI />);

    expect(screen.getByText("Connecting…")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Connect printer" });
    expect(btn).toBeDisabled();
  });

  it("renders 'Connection error' with reason and 'Connect printer' button in error state", () => {
    mockBle({
      bleState: "error",
      errorMessage: "No compatible printer characteristic found",
      isSupported: true,
    });
    render(<PrinterConnectUI />);

    expect(
      screen.getByText(/Connection error.*No compatible printer characteristic found/),
    ).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Connect printer" });
    expect(btn).toBeEnabled();
  });

  it("hides Connect button and shows not-available note when isSupported is false", () => {
    mockBle({ bleState: "disconnected", isSupported: false });
    render(<PrinterConnectUI />);

    expect(
      screen.getByText("BLE printing is not available in this browser"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows HTTPS error and hides Connect button on insecure contexts", () => {
    mockBle({
      bleState: "error",
      errorMessage: "Web Bluetooth requires HTTPS",
      isSupported: false,
    });
    render(<PrinterConnectUI />);

    expect(
      screen.getByText(/Connection error.*Web Bluetooth requires HTTPS/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls connect() when 'Connect printer' is clicked", () => {
    const ble = mockBle({ bleState: "disconnected", isSupported: true });
    render(<PrinterConnectUI />);

    fireEvent.click(screen.getByRole("button", { name: "Connect printer" }));
    expect(ble.connect).toHaveBeenCalledTimes(1);
  });

  it("calls disconnect() when 'Disconnect' is clicked", () => {
    const ble = mockBle({
      bleState: "connected",
      deviceName: "MPT-II",
      isSupported: true,
    });
    render(<PrinterConnectUI />);

    fireEvent.click(screen.getByRole("button", { name: "Disconnect printer" }));
    expect(ble.disconnect).toHaveBeenCalledTimes(1);
  });
});
