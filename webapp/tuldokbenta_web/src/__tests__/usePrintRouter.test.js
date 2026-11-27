/**
 * Property-based and unit tests for usePrintRouter()
 *
 * Feature: ble-receipt-printing
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import fc from "fast-check";
import { usePrintRouter } from "../hooks/usePrintRouter";
import { useBle } from "../context/BleContext";
import { buildEscPos } from "../utils/buildEscPos";
import { printInvoice } from "../utils/printInvoice";

vi.mock("../context/BleContext", () => ({
  useBle: vi.fn(),
}));

vi.mock("../utils/buildEscPos", () => ({
  buildEscPos: vi.fn(),
}));

vi.mock("../utils/printInvoice", () => ({
  printInvoice: vi.fn(),
}));

const bleStateArb = fc.constantFrom("connected", "disconnected", "connecting", "error");

const validSaleArb = fc.record({
  invoice_number: fc.string({ minLength: 1, maxLength: 20 }),
  customer_name: fc.option(fc.string({ maxLength: 20 })),
  items: fc.array(
    fc.record({
      type: fc.constantFrom("service", "item"),
      service_name: fc.string({ minLength: 1, maxLength: 20 }),
      item_name: fc.string({ minLength: 1, maxLength: 20 }),
      price: fc.float({ min: 0, max: 5000, noNaN: true }),
      qty: fc.integer({ min: 1, max: 10 }),
    }),
    { minLength: 1, maxLength: 4 },
  ),
});

const malformedSaleArb = fc.oneof(
  validSaleArb,
  fc.constant(null),
  fc.constant(undefined),
  fc.constant({}),
  fc.record({ invoice_number: fc.anything(), items: fc.anything() }),
);

describe("usePrintRouter — Property 5: printReceipt never throws", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves without throwing for any sale (even malformed) and any BLE state", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await fc.assert(
        fc.asyncProperty(
          malformedSaleArb,
          fc.option(fc.record({ name: fc.string() })),
          bleStateArb,
          fc.boolean(),
          fc.boolean(),
          async (sale, shop, bleState, writeFails, popupThrows) => {
            vi.clearAllMocks();
            const writeBytes = writeFails
              ? vi.fn().mockRejectedValue(new Error("write failed"))
              : vi.fn().mockResolvedValue(undefined);

            useBle.mockReturnValue({ bleState, writeBytes });
            buildEscPos.mockImplementation(() => {
              if (!sale || !Array.isArray(sale.items)) {
                throw new TypeError("malformed sale");
              }
              return new Uint8Array([0x1b, 0x40]);
            });
            printInvoice.mockImplementation(() => {
              if (popupThrows) throw new Error("popup error");
            });

            const { result, unmount } = renderHook(() => usePrintRouter());
            await expect(result.current.printReceipt(sale, shop)).resolves.toBeUndefined();
            unmount();
          },
        ),
        { numRuns: 100 },
      );
    } finally {
      warnSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});

describe("usePrintRouter — Property 6: path is determined by BLE state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses BLE iff bleState === 'connected', otherwise calls printInvoice", async () => {
    await fc.assert(
      fc.asyncProperty(validSaleArb, bleStateArb, async (sale, bleState) => {
        vi.clearAllMocks();
        const fakeBytes = new Uint8Array([0x1b, 0x40, 0x1d, 0x56, 0x00]);
        const writeBytes = vi.fn().mockResolvedValue(undefined);
        useBle.mockReturnValue({ bleState, writeBytes });
        buildEscPos.mockReturnValue(fakeBytes);
        printInvoice.mockImplementation(() => {});

        const { result, unmount } = renderHook(() => usePrintRouter());
        await result.current.printReceipt(sale);

        if (bleState === "connected") {
          expect(buildEscPos).toHaveBeenCalledTimes(1);
          expect(writeBytes).toHaveBeenCalledTimes(1);
          expect(writeBytes).toHaveBeenCalledWith(fakeBytes);
          expect(printInvoice).not.toHaveBeenCalled();
        } else {
          expect(printInvoice).toHaveBeenCalledTimes(1);
          expect(buildEscPos).not.toHaveBeenCalled();
          expect(writeBytes).not.toHaveBeenCalled();
        }
        unmount();
      }),
      { numRuns: 100 },
    );
  });
});

describe("usePrintRouter — unit examples", () => {
  const sampleSale = {
    invoice_number: "INV-0042",
    items: [{ type: "service", service_name: "Wash", price: 120, qty: 1 }],
  };
  const sampleShop = {
    name: "MultiPOS Shop",
    receipt_paper_width_mm: 80,
    receipt_footer: "Thank you!",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("triggers printInvoice fallback for the same sale on mid-print BLE failure", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fakeBytes = new Uint8Array([0x1b, 0x40]);
    const writeBytes = vi.fn().mockRejectedValue(new Error("GATT write lost"));
    useBle.mockReturnValue({ bleState: "connected", writeBytes });
    buildEscPos.mockReturnValue(fakeBytes);

    const { result } = renderHook(() => usePrintRouter());
    await result.current.printReceipt(sampleSale, sampleShop);

    expect(buildEscPos).toHaveBeenCalledWith(sampleSale, sampleShop);
    expect(writeBytes).toHaveBeenCalledWith(fakeBytes);
    expect(printInvoice).toHaveBeenCalledTimes(1);
    expect(printInvoice).toHaveBeenCalledWith(sampleSale, sampleShop);
    warnSpy.mockRestore();
  });

  it("passes shop object through unchanged to buildEscPos and printInvoice", async () => {
    const fakeBytes = new Uint8Array([0x1b, 0x40]);
    const writeBytes = vi.fn().mockResolvedValue(undefined);
    useBle.mockReturnValue({ bleState: "connected", writeBytes });
    buildEscPos.mockReturnValue(fakeBytes);

    const { result: connectedHook } = renderHook(() => usePrintRouter());
    await connectedHook.current.printReceipt(sampleSale, sampleShop);
    expect(buildEscPos.mock.calls[0][1]).toBe(sampleShop);

    useBle.mockReturnValue({ bleState: "disconnected", writeBytes });
    const { result: disconnectedHook } = renderHook(() => usePrintRouter());
    await disconnectedHook.current.printReceipt(sampleSale, sampleShop);
    expect(printInvoice.mock.calls[0][1]).toBe(sampleShop);
  });

  it("calls printInvoice synchronously when disconnected so browser popup activation is preserved", () => {
    useBle.mockReturnValue({ bleState: "disconnected", writeBytes: vi.fn() });

    const { result } = renderHook(() => usePrintRouter());
    // Do not await: verify printInvoice already ran before the microtask queue flushes.
    result.current.printReceipt(sampleSale, sampleShop);

    expect(printInvoice).toHaveBeenCalledTimes(1);
    expect(printInvoice).toHaveBeenCalledWith(sampleSale, sampleShop);
  });
});
