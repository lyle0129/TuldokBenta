/**
 * Feature: open/closed sales UX rework
 * Subject: components/open-sales/{CatalogGrid,CartBar,CartModal}.jsx
 *
 * The cart moved out of a desktop third column into a sticky bar plus a
 * full-screen sheet, because on a phone the old layout put the cart two
 * screens below the catalog.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CatalogGrid from "../components/open-sales/CatalogGrid";
import CartBar from "../components/open-sales/CartBar";
import CartModal from "../components/open-sales/CartModal";

const inventory = [
  { id: 1, item_name: "Ariel", item_classification: "Detergent", price: 50, stock: 10 },
  { id: 2, item_name: "Downy", item_classification: "Fabcon", price: 30, stock: 0 },
];

const services = [
  { id: 9, service_name: "Full Service", price: 180, freebies: ["Detergent"] },
];

// ---------------------------------------------------------------------------
// CatalogGrid
// ---------------------------------------------------------------------------
/** The grid is a two-position slider now; most cases start on Services. */
const renderGrid = (props = {}) =>
  render(
    <CatalogGrid
      inventory={inventory}
      services={services}
      onAddItem={vi.fn()}
      onAddService={vi.fn()}
      {...props}
    />
  );

const showItems = () => fireEvent.click(screen.getByRole("tab", { name: "Items" }));

describe("CatalogGrid", () => {
  it("opens on services, with items one tap away", () => {
    renderGrid();
    expect(screen.getByText("Full Service")).toBeInTheDocument();
    expect(screen.queryByText("Ariel")).not.toBeInTheDocument();

    showItems();
    expect(screen.getByText("Ariel")).toBeInTheDocument();
    expect(screen.queryByText("Full Service")).not.toBeInTheDocument();
  });

  it("narrows the catalog by name", () => {
    renderGrid();
    showItems();

    fireEvent.change(screen.getByLabelText(/search catalog/i), {
      target: { value: "ariel" },
    });

    expect(screen.getByText("Ariel")).toBeInTheDocument();
    expect(screen.queryByText("Downy")).not.toBeInTheDocument();
    expect(screen.queryByText("Full Service")).not.toBeInTheDocument();
  });

  it("narrows the catalog by classification", () => {
    renderGrid();
    showItems();

    fireEvent.change(screen.getByLabelText(/search catalog/i), {
      target: { value: "fabcon" },
    });
    expect(screen.getByText("Downy")).toBeInTheDocument();
    expect(screen.queryByText("Ariel")).not.toBeInTheDocument();
  });

  it("filters to items only", () => {
    renderGrid();

    showItems();
    expect(screen.getByText("Ariel")).toBeInTheDocument();
    expect(screen.queryByText("Full Service")).not.toBeInTheDocument();
  });

  // Without an "All" tab a term that only matches the other side would render
  // an empty grid with the answer one tap away and nothing saying so.
  it("moves the slider to whichever side the search matches", () => {
    renderGrid();

    // Starts on Services; "ariel" only exists among items.
    fireEvent.change(screen.getByLabelText(/search catalog/i), {
      target: { value: "ariel" },
    });
    expect(screen.getByText("Ariel")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Items" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    // And back the other way.
    fireEvent.change(screen.getByLabelText(/search catalog/i), {
      target: { value: "full" },
    });
    expect(screen.getByText("Full Service")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Services" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  // Otherwise the auto-move above would drag the slider straight back and the
  // tab would read as a dead button.
  it("clears the search when a side is chosen by hand", () => {
    renderGrid();

    const search = screen.getByLabelText(/search catalog/i);
    fireEvent.change(search, { target: { value: "ariel" } });
    fireEvent.click(screen.getByRole("tab", { name: "Services" }));

    expect(search).toHaveValue("");
    expect(screen.getByText("Full Service")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Services" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("marks an out-of-stock item without hiding it", () => {
    renderGrid();
    showItems();
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
  });

  it("adds the tapped item and service", () => {
    const onAddItem = vi.fn();
    const onAddService = vi.fn();
    renderGrid({ onAddItem, onAddService });

    fireEvent.click(screen.getByText("Full Service"));
    expect(onAddService).toHaveBeenCalledWith(services[0]);

    showItems();
    fireEvent.click(screen.getByText("Ariel"));
    expect(onAddItem).toHaveBeenCalledWith(inventory[0]);
  });

  it("says so when nothing matches on either side", () => {
    renderGrid();
    fireEvent.change(screen.getByLabelText(/search catalog/i), {
      target: { value: "zzz" },
    });
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// CartBar
// ---------------------------------------------------------------------------
describe("CartBar", () => {
  it("stays hidden while the cart is empty", () => {
    const { container } = render(<CartBar cart={[]} onOpen={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("counts units rather than lines", () => {
    const cart = [
      { type: "inventory", id: 1, name: "Ariel", price: 50, quantity: 3 },
      { type: "service", id: 9, name: "Full Service", price: 180, quantity: 1 },
    ];
    render(<CartBar cart={cart} onOpen={vi.fn()} />);

    expect(screen.getByText("4 items")).toBeInTheDocument();
    expect(screen.getByText("₱330.00")).toBeInTheDocument();
  });

  it("uses the singular for one unit", () => {
    render(
      <CartBar
        cart={[{ type: "inventory", id: 1, name: "Ariel", price: 50, quantity: 1 }]}
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByText("1 item")).toBeInTheDocument();
  });

  it("opens the cart when tapped", () => {
    const onOpen = vi.fn();
    render(
      <CartBar
        cart={[{ type: "inventory", id: 1, name: "Ariel", price: 50, quantity: 1 }]}
        onOpen={onOpen}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /view cart/i }));
    expect(onOpen).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// CartModal
// ---------------------------------------------------------------------------
describe("CartModal", () => {
  const serviceLine = {
    type: "service",
    id: 9,
    name: "Full Service",
    price: 180,
    quantity: 1,
    freebies: [{ classification: "Detergent", choices: [{ item: "", qty: 1 }] }],
  };

  const makeProps = (overrides = {}) => ({
    open: true,
    onClose: vi.fn(),
    cart: [serviceLine],
    inventory,
    onUpdateQuantity: vi.fn(),
    onRemoveItem: vi.fn(),
    onAddFreebieChoice: vi.fn(),
    onChangeFreebieItem: vi.fn(),
    onChangeFreebieQty: vi.fn(),
    onRemoveFreebieChoice: vi.fn(),
    onCheckout: vi.fn(),
    ...overrides,
  });

  it("renders nothing while closed", () => {
    const { container } = render(<CartModal {...makeProps({ open: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it("is a dialog, so assistive tech announces it", () => {
    render(<CartModal {...makeProps()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  // The sheet is shared by the online and offline pages, so this one field is
  // where a customer name is taken for both.
  it("reports the customer name as it is typed", () => {
    const onCustomerNameChange = vi.fn();
    render(<CartModal {...makeProps({ onCustomerNameChange })} />);

    fireEvent.change(screen.getByLabelText(/customer/i), {
      target: { value: "Maria Santos" },
    });
    expect(onCustomerNameChange).toHaveBeenCalledWith("Maria Santos");
  });

  it("shows the name it was given", () => {
    render(
      <CartModal
        {...makeProps({
          customerName: "Maria Santos",
          onCustomerNameChange: vi.fn(),
        })}
      />
    );
    expect(screen.getByLabelText(/customer/i)).toHaveValue("Maria Santos");
  });

  // Purely presentational: a caller that doesn't collect a name gets no field
  // rather than a dead one.
  it("omits the field when no handler is given", () => {
    render(<CartModal {...makeProps()} />);
    expect(screen.queryByLabelText(/customer/i)).not.toBeInTheDocument();
  });

  it("steps quantity up and down", () => {
    const onUpdateQuantity = vi.fn();
    const cart = [{ ...serviceLine, quantity: 2 }];
    render(<CartModal {...makeProps({ cart, onUpdateQuantity })} />);

    fireEvent.click(screen.getByRole("button", { name: /increase quantity/i }));
    expect(onUpdateQuantity).toHaveBeenCalledWith(9, "service", 1);

    fireEvent.click(screen.getByRole("button", { name: /decrease quantity/i }));
    expect(onUpdateQuantity).toHaveBeenCalledWith(9, "service", -1);
  });

  // One is the floor — useCart clamps there anyway, so a live button that did
  // nothing was the worse of the two answers.
  it("won't step below one", () => {
    render(<CartModal {...makeProps()} />);
    expect(
      screen.getByRole("button", { name: /decrease quantity/i })
    ).toBeDisabled();
  });

  // Tapping + twenty times isn't a quantity control, so the number stays typeable
  // and the delta is worked out from what was typed.
  it("takes a quantity typed straight into the box", () => {
    const onUpdateQuantity = vi.fn();
    render(<CartModal {...makeProps({ onUpdateQuantity })} />);

    // Exact, not a regex: the two buttons either side are labelled
    // "…crease quantity of Full Service", so a substring match finds three.
    fireEvent.change(screen.getByLabelText("Quantity of Full Service"), {
      target: { value: "12" },
    });
    expect(onUpdateQuantity).toHaveBeenCalledWith(9, "service", 11);
  });

  it("removes a line", () => {
    const onRemoveItem = vi.fn();
    render(<CartModal {...makeProps({ onRemoveItem })} />);

    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    expect(onRemoveItem).toHaveBeenCalledWith(9, "service");
  });

  it("offers only inventory of the freebie's classification", () => {
    render(<CartModal {...makeProps()} />);

    const select = screen.getByLabelText(/free detergent item/i);
    const options = [...select.querySelectorAll("option")].map((o) => o.value);
    // "Downy" is Fabcon, so it must not be offered for a Detergent freebie.
    expect(options).toEqual(["", "Ariel"]);
  });

  it("reports how many freebies are still unclaimed", () => {
    const cart = [
      {
        ...serviceLine,
        quantity: 3,
        freebies: [{ classification: "Detergent", choices: [{ item: "Ariel", qty: 1 }] }],
      },
    ];
    render(<CartModal {...makeProps({ cart })} />);
    expect(screen.getByText("2 left to claim")).toBeInTheDocument();
  });

  it("clamps a cleared freebie quantity to 1 rather than 0", () => {
    const onChangeFreebieQty = vi.fn();
    render(<CartModal {...makeProps({ onChangeFreebieQty })} />);

    fireEvent.change(screen.getByLabelText(/free detergent quantity/i), {
      target: { value: "" },
    });
    expect(onChangeFreebieQty).toHaveBeenCalledWith(9, "Detergent", 0, 1);
  });

  it("disables checkout on an empty cart", () => {
    render(<CartModal {...makeProps({ cart: [] })} />);
    expect(screen.getByRole("button", { name: /checkout/i })).toBeDisabled();
  });

  it("surfaces a server error instead of an alert", () => {
    render(<CartModal {...makeProps({ errorMessage: "Not enough stock for Ariel" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/not enough stock/i);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<CartModal {...makeProps({ onClose })} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
