// pages/OpenSales.jsx
import { useState, useEffect } from "react";
import { useInventory } from "../hooks/useInventory";
import { useServices } from "../hooks/useServices";
import {
  useOpenSales,
  useNextInvoice,
  useSaleMutations,
} from "../hooks/useSales";
import { useCart } from "../hooks/useCart";
import ListSales from "../components/open-sales/ListSales";
import CatalogGrid from "../components/open-sales/CatalogGrid";
import CartBar from "../components/open-sales/CartBar";
import CartModal from "../components/open-sales/CartModal";
import ConfirmDialog from "../components/shared/ConfirmDialog";
import { buildSaleItems } from "../utils/buildSaleItems";
import { freebieGapsFromCart, describeFreebieGaps } from "../utils/freebies";
import { parseInvoiceSeq } from "../utils/invoiceNumber";
import {
  writeJSON,
  OFFLINE_CATALOG_KEY,
  OFFLINE_NEXT_INVOICE_KEY,
} from "../utils/storage";

const OpenSales = () => {
  const { inventory } = useInventory();
  const { services } = useServices();
  const { openSales } = useOpenSales();
  // What the next sale will be numbered, so the cashier can see where the numbering
  // stands from inside the cart. One small query — this page used to derive the same
  // string from max(open ∪ closed) + 1, which meant downloading the entire
  // closed-sales table for one integer.
  const { nextInvoice } = useNextInvoice();
  const { createOpenSale, updateOpenSale, deleteOpenSale, paySale } =
    useSaleMutations();

  const [customerName, setCustomerName] = useState("");
  const [showCart, setShowCart] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
  const [freebieGaps, setFreebieGaps] = useState(null);

  const {
    cart,
    addInventoryToCart,
    addServiceToCart,
    addFreebieChoice,
    updateFreebieChoice,
    updateFreebieQuantity,
    removeFreebieChoice,
    updateQuantity,
    clearCart,
    removeItem,
  } = useCart();

  // Keep the offline page's catalog fresh as a side effect of normal online
  // use, so it rarely has to fall back to the built-in seed list.
  useEffect(() => {
    if (inventory.length === 0 && services.length === 0) return;
    writeJSON(OFFLINE_CATALOG_KEY, {
      inventory,
      services,
      syncedAt: new Date().toISOString(),
    });
  }, [inventory, services]);

  const submitSale = async () => {
    setIsSubmitting(true);
    setCheckoutError(null);

    // No invoice_number: the server allocates it. See createOpenSale in
    // backend/controllers/openSalesController.js.
    const sale = {
      items: buildSaleItems(cart),
      customer_name: customerName.trim() || null,
    };
    const { ok, message, data } = await createOpenSale(sale);

    setIsSubmitting(false);
    if (ok) {
      // Hand the offline page a starting point. It can only count from its own
      // queue otherwise, so a drained queue plus a reload restarted it at INV-0001
      // and every sync then collided. This is the freshest signal available and
      // costs no extra request.
      const seq = parseInvoiceSeq(data?.invoice_number);
      if (seq !== null) writeJSON(OFFLINE_NEXT_INVOICE_KEY, seq + 1);

      // Stock changed server-side, but the mutation already invalidated the
      // inventory cache — no manual refetch needed.
      clearCart();
      // Belongs to the sale that just closed, not to the next customer.
      setCustomerName("");
      setShowCart(false);
    } else {
      // Surfaced in the cart sheet rather than an alert(), so the cashier can
      // see which line the server complained about while fixing it.
      setCheckoutError(message || "Could not save the sale.");
    }
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;

    // A service grants free picks that are easy to forget; warn once rather
    // than letting the sale close with the customer never getting them.
    const gaps = freebieGapsFromCart(cart);
    if (gaps.length > 0) {
      setFreebieGaps(gaps);
      return;
    }
    submitSale();
  };

  return (
    <div className="max-w-7xl mx-auto mt-6 p-4 sm:p-6 pb-28">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100">
          Open Sales
        </h1>
        {nextInvoice && (
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Next invoice:{" "}
            <span className="font-semibold text-blue-700 dark:text-blue-400">
              {nextInvoice}
            </span>
          </span>
        )}
      </div>

      <CatalogGrid
        inventory={inventory}
        services={services}
        onAddItem={(item) => {
          addInventoryToCart(item);
          setCheckoutError(null);
        }}
        onAddService={(service) => {
          addServiceToCart(service);
          setCheckoutError(null);
        }}
      />

      <div className="mt-10">
        <ListSales
          openSales={openSales}
          deleteOpenSale={deleteOpenSale}
          updateOpenSale={updateOpenSale}
          paySale={paySale}
          inventory={inventory}
          services={services}
        />
      </div>

      <CartBar cart={cart} onOpen={() => setShowCart(true)} />

      <CartModal
        open={showCart}
        onClose={() => setShowCart(false)}
        cart={cart}
        inventory={inventory}
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeItem}
        onAddFreebieChoice={addFreebieChoice}
        onChangeFreebieItem={updateFreebieChoice}
        onChangeFreebieQty={updateFreebieQuantity}
        onRemoveFreebieChoice={removeFreebieChoice}
        customerName={customerName}
        onCustomerNameChange={setCustomerName}
        onCheckout={handleCheckout}
        checkoutLabel={nextInvoice ? `Open Sale ${nextInvoice}` : "Open Sale"}
        isSubmitting={isSubmitting}
        errorMessage={checkoutError}
        title={nextInvoice ? `Cart · ${nextInvoice}` : "Cart"}
      />

      <ConfirmDialog
        open={freebieGaps !== null}
        title="Unused freebie"
        message="Are you sure you want to open this sale? One of your services has a freebie that is unused."
        details={freebieGaps ? describeFreebieGaps(freebieGaps) : []}
        confirmLabel="Open Sale Anyway"
        cancelLabel="Go Back"
        onCancel={() => setFreebieGaps(null)}
        onConfirm={() => {
          setFreebieGaps(null);
          submitSale();
        }}
      />
    </div>
  );
};

export default OpenSales;
