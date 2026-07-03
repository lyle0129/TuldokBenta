import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import EditSaleModal from "../components/sales-modals/EditSaleModal";
import PaySaleModal from "../components/sales-modals/PaySaleModal";
import DeleteSaleModal from "../components/sales-modals/DeleteSaleModal";
import AddItemModal from "../components/sales-modals/AddItemModal";

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
  const validProps = {
    sale: mockSale,
    onClose: vi.fn(),
    onSave: vi.fn(),
    onUpdate: vi.fn(),
    inventory: mockInventory,
  };

  it("renders without crashing when given valid props", () => {
    render(<EditSaleModal {...validProps} />);
    expect(screen.getByText(/Edit Invoice #INV-0001/i)).toBeInTheDocument();
  });

  it("returns null when sale is null", () => {
    const { container } = render(
      <EditSaleModal {...validProps} sale={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when sale is undefined", () => {
    const { container } = render(
      <EditSaleModal {...validProps} sale={undefined} />
    );
    expect(container.firstChild).toBeNull();
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

// ---------------------------------------------------------------------------
// AddItemModal
// ---------------------------------------------------------------------------
describe("AddItemModal", () => {
  const validProps = {
    sale: mockSale,
    onClose: vi.fn(),
    onAdd: vi.fn(),
    inventory: mockInventory,
    services: mockServices,
  };

  it("renders without crashing when given valid props", () => {
    render(<AddItemModal {...validProps} />);
    expect(screen.getByText(/Add Items or Services/i)).toBeInTheDocument();
  });

  it("returns null when sale is null", () => {
    const { container } = render(
      <AddItemModal {...validProps} sale={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when sale is undefined", () => {
    const { container } = render(
      <AddItemModal {...validProps} sale={undefined} />
    );
    expect(container.firstChild).toBeNull();
  });
});
