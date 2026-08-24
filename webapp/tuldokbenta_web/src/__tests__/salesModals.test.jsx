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
  // Grants one free Soap per unit. The modal rebuilds a sale's freebie picker
  // from this, since the sale itself stores nothing about what it owes.
  { id: 2, service_name: "Full Service", price: 180, freebies: ["Soap"] },
];

// ---------------------------------------------------------------------------
// EditSaleModal
// ---------------------------------------------------------------------------
describe("EditSaleModal", () => {
  const makeProps = (overrides = {}) => ({
    sale: mockSale,
    onClose: vi.fn(),
    onSave: vi.fn(),
    inventory: mockInventory,
    services: mockServices,
    ...overrides,
  });

  /** The sale handed to onSave — what actually reaches the server. */
  const savedSale = (onSave) => onSave.mock.calls[0][0];

  const clickSave = () =>
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

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
    render(<EditSaleModal {...makeProps()} />);

    fireEvent.click(screen.getByRole("button", { name: /remove detergent/i }));

    expect(screen.getByText(/no items left/i)).toBeInTheDocument();
  });

  // The number is still typeable — the buttons are for nudging, not the only
  // way in.
  it("steps a line's quantity up and down", () => {
    const onSave = vi.fn();
    render(<EditSaleModal {...makeProps({ onSave })} />);

    // mockSale's Detergent line starts at 2.
    fireEvent.click(
      screen.getByRole("button", { name: /increase quantity of detergent/i })
    );
    expect(screen.getByLabelText(/quantity for detergent/i)).toHaveValue(3);

    fireEvent.click(
      screen.getByRole("button", { name: /decrease quantity of detergent/i })
    );
    clickSave();

    expect(savedSale(onSave).items[0].qty).toBe(2);
  });

  it("won't step a line below one", () => {
    const sale = {
      ...mockSale,
      items: [{ type: "item", item_name: "Detergent", price: 50, qty: 1 }],
    };
    render(<EditSaleModal {...makeProps({ sale })} />);

    expect(
      screen.getByRole("button", { name: /decrease quantity of detergent/i })
    ).toBeDisabled();
  });

  it("clamps a cleared quantity to 1 rather than sending 0", () => {
    const onSave = vi.fn();
    render(<EditSaleModal {...makeProps({ onSave })} />);

    fireEvent.change(screen.getByLabelText(/quantity for detergent/i), {
      target: { value: "" },
    });
    clickSave();

    expect(savedSale(onSave).items[0].qty).toBe(1);
  });

  // The staged copy is the modal's own; the row it came from must be left as
  // the list handed it over, or abandoning the edit with Cancel wouldn't.
  it("does not mutate the sale it was given", () => {
    const onSave = vi.fn();
    render(<EditSaleModal {...makeProps({ onSave })} />);

    fireEvent.change(screen.getByLabelText(/quantity for detergent/i), {
      target: { value: "7" },
    });

    expect(mockSale.items[0].qty).toBe(2);
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
    const onSave = vi.fn();
    render(<EditSaleModal {...makeProps({ onSave })} />);

    fireEvent.change(screen.getByLabelText(/customer/i), {
      target: { value: "Maria Santos" },
    });
    clickSave();

    const saved = savedSale(onSave);
    expect(saved.customer_name).toBe("Maria Santos");
    // The lines are untouched — this is not a line edit.
    expect(saved.items).toEqual(mockSale.items);
  });

  // Emptying the box has to reach the server as "" so it can clear the column;
  // dropping the key would mean the old name silently stayed.
  it("keeps an emptied customer name as a real edit", () => {
    const onSave = vi.fn();
    const named = { ...mockSale, customer_name: "Maria Santos" };
    render(<EditSaleModal {...makeProps({ sale: named, onSave })} />);

    fireEvent.change(screen.getByLabelText(/customer/i), {
      target: { value: "" },
    });
    clickSave();

    const saved = savedSale(onSave);
    expect(saved.customer_name).toBe("");
    expect("customer_name" in saved).toBe(true);
  });

  // The invoice number is the offline page's alone — the server hands out the
  // online ones, and a box for it there would invite a duplicate.
  it("hides the invoice number field unless allowInvoiceEdit is set", () => {
    render(<EditSaleModal {...makeProps()} />);
    expect(screen.queryByLabelText(/invoice number/i)).not.toBeInTheDocument();
  });

  it("stages an edited invoice number when allowInvoiceEdit is set", () => {
    const onSave = vi.fn();
    render(<EditSaleModal {...makeProps({ onSave, allowInvoiceEdit: true })} />);

    fireEvent.change(screen.getByLabelText(/invoice number/i), {
      target: { value: "INV-0099" },
    });
    clickSave();

    expect(savedSale(onSave).invoice_number).toBe("INV-0099");
  });

  it("refuses to save an offline sale with no invoice number", () => {
    const onSave = vi.fn();
    render(<EditSaleModal {...makeProps({ onSave, allowInvoiceEdit: true })} />);

    fireEvent.change(screen.getByLabelText(/invoice number/i), {
      target: { value: "  " },
    });
    clickSave();

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/needs an invoice number/i);
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

  // -------------------------------------------------------------------------
  // Reseeding between rows
  //
  // The modal is mounted once and fed whichever row was clicked, so anything it
  // fails to reset bleeds from one sale onto the next.
  // -------------------------------------------------------------------------
  it("reseeds its draft when a different sale is opened", () => {
    const { rerender } = render(<EditSaleModal {...makeProps()} />);

    fireEvent.change(screen.getByLabelText(/customer/i), {
      target: { value: "Maria Santos" },
    });

    const other = { ...mockSale, id: 2, invoice_number: "INV-0002" };
    rerender(<EditSaleModal {...makeProps({ sale: other })} />);

    expect(screen.getByText(/Edit Invoice #INV-0002/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/customer/i)).toHaveValue("");
  });

  // The worst version of the leak: dismissing the warning left `freebieGaps`
  // set, so it reappeared on the next sale and confirming it saved *that* one.
  it("drops a dismissed freebie warning when a different sale is opened", () => {
    const { rerender } = render(
      <EditSaleModal {...makeProps({ sale: saleWithUnclaimedFreebie })} />
    );

    clickSave();
    expect(screen.getByText(/freebie that is unused/i)).toBeInTheDocument();

    const other = { ...mockSale, id: 2, invoice_number: "INV-0002" };
    rerender(<EditSaleModal {...makeProps({ sale: other })} />);

    expect(screen.queryByText(/freebie that is unused/i)).not.toBeInTheDocument();
  });

  it("clears the last server error when a different sale is opened", () => {
    const { rerender } = render(
      <EditSaleModal {...makeProps({ errorMessage: "Not enough stock for Detergent" })} />
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    const other = { ...mockSale, id: 2, invoice_number: "INV-0002" };
    rerender(<EditSaleModal {...makeProps({ sale: other })} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // "Not enough stock for X" stops being true the moment X is changed.
  it("hides the server error once the sale is edited again", () => {
    render(
      <EditSaleModal {...makeProps({ errorMessage: "Not enough stock for Detergent" })} />
    );

    fireEvent.change(screen.getByLabelText(/quantity for detergent/i), {
      target: { value: "1" },
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Freebie clamping
  // -------------------------------------------------------------------------
  it("trims claimed freebies when a service's quantity is lowered", () => {
    const onSave = vi.fn();
    // Stored flat: a bare service line and its free Soap as a plain price-0 row.
    const sale = {
      ...mockSale,
      items: [
        { type: "service", service_name: "Full Service", qty: 3, price: 180 },
        { type: "item", item_name: "Detergent", qty: 3, price: 0 },
      ],
    };
    render(<EditSaleModal {...makeProps({ sale, onSave })} />);

    fireEvent.change(screen.getByLabelText(/quantity for full service/i), {
      target: { value: "1" },
    });
    clickSave();

    // Only one price-0 line survives, so only one unit of stock moves — and it
    // is saved flat, exactly as it was loaded.
    expect(savedSale(onSave).items).toEqual([
      { type: "service", service_name: "Full Service", qty: 1, price: 180 },
      { type: "item", item_name: "Detergent", qty: 1, price: 0 },
    ]);
  });

  // The picker is rebuilt from the service catalog, so a sale that stores
  // nothing about its freebies still gets one.
  it("rebuilds the freebie picker for a flat sale", () => {
    const sale = {
      ...mockSale,
      items: [
        { type: "service", service_name: "Full Service", qty: 1, price: 180 },
        { type: "item", item_name: "Detergent", qty: 1, price: 0 },
      ],
    };
    render(<EditSaleModal {...makeProps({ sale })} />);

    expect(screen.getByText(/free soap/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/free soap item/i)).toHaveValue("Detergent");
    // Absorbed into the picker, so it is not also a loose row.
    expect(
      screen.queryByRole("button", { name: /remove detergent/i })
    ).not.toBeInTheDocument();
  });

  it("saves a flat sale back flat when nothing was changed", () => {
    const onSave = vi.fn();
    const items = [
      { type: "service", service_name: "Full Service", qty: 1, price: 180 },
      { type: "item", item_name: "Detergent", qty: 1, price: 0 },
    ];
    render(<EditSaleModal {...makeProps({ sale: { ...mockSale, items }, onSave })} />);

    clickSave();
    expect(savedSale(onSave).items).toEqual(items);
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

  // The method carried over from the last invoice, preselected with Confirm
  // already enabled — one misclick recorded the wrong tender, and a closed
  // sale's method could only be fixed by reverting it.
  it("clears the selected method when a different sale is opened", () => {
    const { rerender } = renderWithQuery(<PaySaleModal {...validProps} />);

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "cash" } });

    rerender(
      <PaySaleModal {...validProps} sale={{ ...mockSale, id: 2 }} />
    );

    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.getByRole("button", { name: /confirm payment/i })).toBeDisabled();
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

  // Without the reseed, "delete" was still in the box from the last time, so
  // the type-to-confirm guard was dead for every delete after the first.
  it("empties the confirmation box when a different sale is opened", () => {
    const { rerender } = render(<DeleteSaleModal {...validProps} />);

    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: "delete" },
    });
    expect(
      screen.getByRole("button", { name: /delete permanently/i })
    ).toBeEnabled();

    rerender(
      <DeleteSaleModal
        {...validProps}
        sale={{ ...mockSale, id: 2, invoice_number: "INV-0002" }}
      />
    );

    expect(screen.getByLabelText(/type delete to confirm/i)).toHaveValue("");
    expect(
      screen.getByRole("button", { name: /delete permanently/i })
    ).toBeDisabled();
  });
});
