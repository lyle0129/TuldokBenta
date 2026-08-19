import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import EditSaleModal from "../components/sales-modals/EditSaleModal";
import PaySaleModal from "../components/sales-modals/PaySaleModal";
import DeleteSaleModal from "../components/sales-modals/DeleteSaleModal";
import { renderWithQuery } from "./utils/renderWithQuery.jsx";

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

  // Every sale taken before the field existed has customer_name === null, so
  // an empty box is the normal starting state rather than a missing value.
  it("leaves the customer box empty for a sale that has no name", () => {
    render(<EditSaleModal {...makeProps()} />);
    expect(screen.getByLabelText(/customer/i)).toHaveValue("");
  });

  it("shows the sale's existing customer name", () => {
    render(
      <EditSaleModal
        {...makeProps({ sale: { ...mockSale, customer_name: "Maria Santos" } })}
      />
    );
    expect(screen.getByLabelText(/customer/i)).toHaveValue("Maria Santos");
  });

  it("stages a customer name onto the sale", () => {
    const onUpdate = vi.fn();
    render(<EditSaleModal {...makeProps({ onUpdate })} />);

    fireEvent.change(screen.getByLabelText(/customer/i), {
      target: { value: "Maria Santos" },
    });

    const reducer = onUpdate.mock.calls[0][0];
    expect(reducer(mockSale).customer_name).toBe("Maria Santos");
    // The lines are untouched — this is not a line edit.
    expect(reducer(mockSale).items).toEqual(mockSale.items);
  });

  // Emptying the box has to reach the server as "" so it can clear the column;
  // dropping the key would mean the old name silently stayed.
  it("keeps an emptied customer name as a real edit", () => {
    const onUpdate = vi.fn();
    const named = { ...mockSale, customer_name: "Maria Santos" };
    render(<EditSaleModal {...makeProps({ sale: named, onUpdate })} />);

    fireEvent.change(screen.getByLabelText(/customer/i), {
      target: { value: "" },
    });

    const reducer = onUpdate.mock.calls[0][0];
    const staged = reducer(named);
    expect(staged.customer_name).toBe("");
    expect("customer_name" in staged).toBe(true);
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

  // -------------------------------------------------------------------------
  // Unused-freebie guard
  // -------------------------------------------------------------------------
  const saleWithUnclaimedFreebie = {
    ...mockSale,
    items: [
      {
        type: "service",
        service_name: "Full Service",
        qty: 1,
        price: 180,
        freebies: [{ classification: "Soap", choices: [] }],
      },
    ],
  };

  it("saves straight away when every freebie is claimed", () => {
    const onSave = vi.fn();
    const sale = {
      ...mockSale,
      items: [
        {
          type: "service",
          service_name: "Full Service",
          qty: 1,
          price: 180,
          freebies: [
            { classification: "Soap", choices: [{ item: "Detergent", qty: 1 }] },
          ],
        },
      ],
    };
    render(<EditSaleModal {...makeProps({ sale, onSave })} />);

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("warns instead of saving when a service freebie is unclaimed", () => {
    const onSave = vi.fn();
    render(
      <EditSaleModal {...makeProps({ sale: saleWithUnclaimedFreebie, onSave })} />
    );

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/freebie that is unused/i)).toBeInTheDocument();
    expect(screen.getByText(/Full Service — 1 Soap not claimed/)).toBeInTheDocument();
  });

  it("saves after the warning is confirmed", () => {
    const onSave = vi.fn();
    render(
      <EditSaleModal {...makeProps({ sale: saleWithUnclaimedFreebie, onSave })} />
    );

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    fireEvent.click(screen.getByRole("button", { name: /save anyway/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does not save when the warning is dismissed", () => {
    const onSave = vi.fn();
    render(
      <EditSaleModal {...makeProps({ sale: saleWithUnclaimedFreebie, onSave })} />
    );

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByText(/freebie that is unused/i)).not.toBeInTheDocument();
  });

  it("warns when a freebie row was added but left on '-- Select --'", () => {
    const onSave = vi.fn();
    const sale = {
      ...mockSale,
      items: [
        {
          type: "service",
          service_name: "Full Service",
          qty: 1,
          price: 180,
          freebies: [{ classification: "Soap", choices: [{ item: "", qty: 1 }] }],
        },
      ],
    };
    render(<EditSaleModal {...makeProps({ sale, onSave })} />);

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/has no item chosen/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// PaySaleModal
// ---------------------------------------------------------------------------
// The method dropdown reads the payment_methods table through the shared cache,
// so this one needs a QueryClient. See paymentMethods.test.jsx for the options
// themselves; these only pin the render guards.
describe("PaySaleModal", () => {
  const validProps = {
    sale: mockSale,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
  };

  it("renders without crashing when given valid props", () => {
    renderWithQuery(<PaySaleModal {...validProps} />);
    expect(screen.getByText(/Pay Invoice #INV-0001/i)).toBeInTheDocument();
  });

  it("returns null when sale is null", () => {
    const { container } = renderWithQuery(
      <PaySaleModal {...validProps} sale={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when sale is undefined", () => {
    const { container } = renderWithQuery(
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
