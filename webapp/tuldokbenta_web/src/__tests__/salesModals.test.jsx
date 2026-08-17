import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import EditSaleModal from "../components/sales-modals/EditSaleModal";
import PaySaleModal from "../components/sales-modals/PaySaleModal";
import DeleteSaleModal from "../components/sales-modals/DeleteSaleModal";

const mockSale = {
  id: 1,
  invoice_number: "INV-0001",
  created_at: "2024-01-01T00:00:00Z",
  items: [
    { type: "item", item_name: "Detergent", price: 50, qty: 2 },
  ],
};

const mockInventory = [
  { id: 1, item_name: "Detergent", item_classification: "Soap", price: 50, stock: 10 },
];

const mockServices = [
  { id: 1, service_name: "Wash & Dry", price: 150, freebies: [] },
];

// ---------------------------------------------------------------------------
// EditSaleModal
// ---------------------------------------------------------------------------
describe("EditSaleModal", () => {
  const makeProps = (overrides = {}) => ({
    sale: mockSale,
    onClose: vi.fn(),
    onSave: vi.fn(),
    onUpdate: vi.fn(),
    inventory: mockInventory,
    services: mockServices,
    ...overrides,
  });

  it("renders without crashing when given valid props", () => {
    render(<EditSaleModal {...makeProps()} />);
    expect(screen.getByText(/Edit Invoice #INV-0001/i)).toBeInTheDocument();
  });

  it("returns null when sale is null", () => {
    const { container } = render(<EditSaleModal {...makeProps({ sale: null })} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when sale is undefined", () => {
    const { container } = render(<EditSaleModal {...makeProps({ sale: undefined })} />);
    expect(container.firstChild).toBeNull();
  });

  it("offers a remove control for each line item", () => {
    render(<EditSaleModal {...makeProps()} />);
    expect(
      screen.getByRole("button", { name: /remove detergent/i })
    ).toBeInTheDocument();
  });

  it("drops the line from items when remove is clicked", () => {
    const onUpdate = vi.fn();
    render(<EditSaleModal {...makeProps({ onUpdate })} />);

    fireEvent.click(screen.getByRole("button", { name: /remove detergent/i }));

    // onUpdate is called with a reducer; apply it to see the staged result.
    const reducer = onUpdate.mock.calls[0][0];
    expect(reducer(mockSale).items).toEqual([]);
  });

  it("clamps a cleared quantity to 1 rather than sending 0", () => {
    const onUpdate = vi.fn();
    render(<EditSaleModal {...makeProps({ onUpdate })} />);

    fireEvent.change(screen.getByLabelText(/quantity for detergent/i), {
      target: { value: "" },
    });

    const reducer = onUpdate.mock.calls[0][0];
    expect(reducer(mockSale).items[0].qty).toBe(1);
  });

  it("shows the server's error message instead of failing silently", () => {
    render(
      <EditSaleModal {...makeProps({ errorMessage: "Not enough stock for Detergent" })} />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /not enough stock for detergent/i
    );
  });

  it("refuses to save a sale with no lines left", () => {
    const onSave = vi.fn();
    render(
      <EditSaleModal
        {...makeProps({ sale: { ...mockSale, items: [] }, onSave })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/at least one line/i);
  });
});

// ---------------------------------------------------------------------------
// PaySaleModal
// ---------------------------------------------------------------------------
describe("PaySaleModal", () => {
  const validProps = {
    sale: mockSale,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
  };

  it("renders without crashing when given valid props", () => {
    render(<PaySaleModal {...validProps} />);
    expect(screen.getByText(/Pay Invoice #INV-0001/i)).toBeInTheDocument();
  });

  it("returns null when sale is null", () => {
    const { container } = render(
      <PaySaleModal {...validProps} sale={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when sale is undefined", () => {
    const { container } = render(
      <PaySaleModal {...validProps} sale={undefined} />
    );
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DeleteSaleModal
// ---------------------------------------------------------------------------
describe("DeleteSaleModal", () => {
  const validProps = {
    sale: mockSale,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
  };

  it("renders without crashing when given valid props", () => {
    render(<DeleteSaleModal {...validProps} />);
    expect(screen.getByText(/Confirm Delete/i)).toBeInTheDocument();
    expect(screen.getByText(/INV-0001/i)).toBeInTheDocument();
  });

  it("returns null when sale is null", () => {
    const { container } = render(
      <DeleteSaleModal {...validProps} sale={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when sale is undefined", () => {
    const { container } = render(
      <DeleteSaleModal {...validProps} sale={undefined} />
    );
    expect(container.firstChild).toBeNull();
  });
});
