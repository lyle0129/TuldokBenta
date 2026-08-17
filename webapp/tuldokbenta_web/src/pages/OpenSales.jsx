// pages/OpenSales.jsx
import { useState, useEffect } from "react";
import { useInventory } from "../hooks/useInventory";
import { useServices } from "../hooks/useServices";
import { useSales } from "../hooks/useSales";
import { useCart } from "../hooks/useCart";
import ListSales from "../components/open-sales/ListSales";
import CatalogGrid from "../components/open-sales/CatalogGrid";
import CartBar from "../components/open-sales/CartBar";
import CartModal from "../components/open-sales/CartModal";
import ConfirmDialog from "../components/shared/ConfirmDialog";
import { buildSaleItems } from "../utils/buildSaleItems";
import { freebieGapsFromCart, describeFreebieGaps } from "../utils/freebies";
import { writeJSON, OFFLINE_CATALOG_KEY } from "../utils/storage";

const OpenSales = () => {
  const { inventory, loadInventory } = useInventory();
  const { services, loadServices } = useServices();
  const {
    openSales,
    closedSales,
    loadSales,
    createOpenSale,
    updateOpenSale,
    deleteOpenSale,
    paySale,
  } = useSales();

  const [nextInvoice, setNextInvoice] = useState("INV-0001");
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

  useEffect(() => {
    loadInventory();
    loadServices();
    loadSales();
  }, [loadInventory, loadServices, loadSales]);

  // 🔢 Generate next invoice number across both open + closed
  useEffect(() => {
    const allSales = [...openSales, ...(closedSales || [])];

    if (allSales.length > 0) {
      const numbers = allSales
        .map((s) => s.invoice_number)
        .filter(Boolean)
        .map((inv) => parseInt(inv.replace("INV-", ""), 10));
      const max = numbers.length > 0 ? Math.max(...numbers) : 0;
      const next = String(max + 1).padStart(4, "0");
      setNextInvoice(`INV-${next}`);
    } else {
      setNextInvoice("INV-0001");
    }
  }, [openSales, closedSales]);

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

    const sale = { invoice_number: nextInvoice, items: buildSaleItems(cart) };
    const { ok, message } = await createOpenSale(sale);

    setIsSubmitting(false);
    if (ok) {
      clearCart();
      setShowCart(false);
      await loadInventory(); // stock just changed server-side
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
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Next invoice:{" "}
          <span className="font-semibold text-blue-700 dark:text-blue-400">
            {nextInvoice}
          </span>
        </span>
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
          loadSales={loadSales}
          loadInventory={loadInventory}
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
        onCheckout={handleCheckout}
        checkoutLabel={`Open Sale ${nextInvoice}`}
        isSubmitting={isSubmitting}
        errorMessage={checkoutError}
        title={`Cart · ${nextInvoice}`}
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
