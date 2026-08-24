import { useState, useEffect, useMemo, useRef } from "react";
import { useSaleMutations } from "../hooks/useSales";
import { useCart } from "../hooks/useCart";
import { useOfflineCatalog } from "../hooks/useOfflineCatalog";
import CatalogGrid from "../components/open-sales/CatalogGrid";
import CartBar from "../components/open-sales/CartBar";
import CartModal from "../components/open-sales/CartModal";
import EditSaleModal from "../components/sales-modals/EditSaleModal";
import ConfirmDialog from "../components/shared/ConfirmDialog";
import SearchInput from "../components/shared/SearchInput";
import { printInvoice } from "../utils/printInvoice";
import { buildSaleItems, isFreeLine } from "../utils/buildSaleItems";
import { freebieGapsFromCart, describeFreebieGaps } from "../utils/freebies";
import { filterSales } from "../utils/filterSales";
import { formatCurrency, formatDateTime, saleTotal } from "../utils/format";
import {
  formatInvoiceNumber,
  parseInvoiceSeq,
  maxInvoiceSeq,
} from "../utils/invoiceNumber";
import {
  readJSON,
  writeJSON,
  OFFLINE_SALES_KEY,
  OFFLINE_NEXT_INVOICE_KEY,
} from "../utils/storage";
import {
  saleCardClass,
  saleActionsClass,
  rowActionClass,
  rowActionAccents,
} from "../components/shared/fieldStyles";

const OpenSalesOffline = () => {
  // The queue element itself, not a { ...s, index } snapshot. Positions shift
  // whenever a sale is synced or deleted, and the status banner doesn't block
  // the list, so a captured index could land the save on a different sale.
  const [editingSale, setEditingSale] = useState(null);
  const [deletingSale, setDeletingSale] = useState(null);
  // The queue element currently being synced, so its button can be disabled. A
  // double-click used to fire two POSTs; the second was a harmless duplicate-invoice
  // rejection, but now that the server allocates a fresh number on collision it would
  // create a second real sale and deduct the stock twice.
  const [syncingSale, setSyncingSale] = useState(null);
  // A sale that landed on a different number than it was queued under.
  // { requested: string, created: <the server's row> }
  const [reassigned, setReassigned] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [freebieGaps, setFreebieGaps] = useState(null);
  // Replaces the alert() storm this page ran on — a banner can be read while
  // the queue is still on screen, and doesn't block the UI thread.
  const [status, setStatus] = useState(null); // { tone: "ok" | "error", text }
  const [query, setQuery] = useState("");

  // Mutations only. useSales() used to drag three list fetches onto a page that
  // renders none of them — the last thing a flaky connection needs.
  const { createOpenSale } = useSaleMutations();

  // Real inventory and services, cached from the server. Replaces a hardcoded
  // list that went stale as soon as anyone edited Inventory.
  //
  // `shop` is the receipt header, cached in the same snapshot so a receipt
  // printed with no connection still carries one. From the snapshot rather than
  // from useShopProfile because this page deliberately runs no list queries —
  // the whole point of it is that it works when nothing can be fetched.
  const {
    inventory,
    services,
    shop,
    lastSyncedAt,
    isSeed,
    refresh: refreshCatalog,
    isRefreshing,
    error: catalogError,
  } = useOfflineCatalog();

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

  const [sales, setSales] = useState([]);
  const [invoiceNumber, setInvoiceNumber] = useState("INV-0001");
  const [customerName, setCustomerName] = useState("");

  // The queue as it stands right now, for the async handler below. It can't read
  // `sales`: that is captured when the handler is created, and a request in flight
  // outlives the snapshot. Delete a sale while another is syncing and the finished
  // sync used to write back the array the deleted one was still in, resurrecting it.
  const salesRef = useRef([]);

  // The in-flight guard, separate from `syncingSale`. That state drives the button's
  // disabled look but is only readable as of the last render; this is true the
  // instant the request starts, which is what a second click has to be measured
  // against when the cost of missing one is a duplicated sale.
  const syncingRef = useRef(false);

  // 🧠 Load sales and next invoice from localStorage
  useEffect(() => {
    // readJSON tolerates corrupt data; a bare JSON.parse used to throw during
    // render and white-screen the page, taking the queue with it.
    const stored = readJSON(OFFLINE_SALES_KEY, []);
    salesRef.current = stored;
    setSales(stored);

    // Two sources, whichever is further along. The queue alone is not enough: it
    // empties as sales sync, and on the next reload numbering restarted from
    // INV-0001 — so the very next offline sale was already taken on the server. The
    // cached value is the number the online page last saw handed out.
    const cachedSeq = Number(readJSON(OFFLINE_NEXT_INVOICE_KEY, 0)) || 0;
    const queueSeq = maxInvoiceSeq(stored.map((s) => s.invoice_number)) + 1;
    setInvoiceNumber(formatInvoiceNumber(Math.max(cachedSeq, queueSeq, 1)));
  }, []);

  const persist = (updated) => {
    salesRef.current = updated;
    setSales(updated);
    return writeJSON(OFFLINE_SALES_KEY, updated);
  };

  /** Drops a sale by identity, against the queue as it stands now. */
  const removeFromQueue = (sale) =>
    persist(salesRef.current.filter((s) => s !== sale));

  /** The next number this page should offer, skipping anything already queued. */
  const advanceInvoice = (current, queue) => {
    const used = new Set(
      queue.map((s) => parseInvoiceSeq(s.invoice_number)).filter((n) => n !== null)
    );
    let seq = (parseInvoiceSeq(current) ?? 0) + 1;
    while (used.has(seq)) seq++;
    return formatInvoiceNumber(seq);
  };

  // 💾 Save to localStorage
  const saveOffline = () => {
    const sale = {
      invoice_number: invoiceNumber,
      items: buildSaleItems(cart),
      customer_name: customerName.trim() || null,
      date: new Date().toISOString(),
    };

    const updated = [...sales, sale];
    if (!persist(updated)) {
      setStatus({ tone: "error", text: "Could not write to offline storage." });
      return;
    }

    setInvoiceNumber(advanceInvoice(invoiceNumber, updated));

    clearCart();
    setCustomerName("");
    setShowCart(false);
    setStatus({ tone: "ok", text: `Sale ${sale.invoice_number} saved offline.` });
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;

    // Same guard as the online page — an unclaimed freebie is just as easy to
    // miss here, and harder to fix once the sale is queued.
    const gaps = freebieGapsFromCart(cart);
    if (gaps.length > 0) {
      setFreebieGaps(gaps);
      return;
    }
    saveOffline();
  };

  /**
   * Pushes one queued sale up to the server.
   *
   * The queued invoice number is a request, not a demand. It was allocated offline
   * against nothing but this queue, so it is usually taken by the time the
   * connection comes back; the server then opens the sale on the next free number
   * instead of refusing it, and says so. That's the point of this page — a stranded
   * sale has to be able to land — but it does mean the receipt the customer is
   * holding now shows the wrong number, which is what the dialog below is for.
   */
  const handleCreateOpenSale = async (sale) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncingSale(sale);

    try {
      // An explicit whitelist, not a spread: `total` and `created_at` were
      // computed here and then discarded server-side. Anything the server
      // should keep has to be named — customer_name included.
      const { ok, message, data } = await createOpenSale({
        invoice_number: sale.invoice_number,
        items: sale.items,
        customer_name: sale.customer_name ?? null,
      });

      if (ok) {
        removeFromQueue(sale);

        if (data?.invoice_reassigned) {
          // A dialog, not the status banner. The receipt in the customer's hand now
          // shows a number that belongs to a different sale, and that has to be
          // dealt with before the next customer — a banner above the fold is too
          // easy to walk past.
          setReassigned({ requested: sale.invoice_number, created: data });
        } else {
          setStatus({
            tone: "ok",
            text: `Open Sale “${data?.invoice_number ?? sale.invoice_number}” created and removed from offline storage.`,
          });
        }
      } else {
        // Kept in local storage so it can be retried. A duplicate invoice number is
        // no longer one of the reasons this fails — what's left is a genuine stock
        // shortage, or a server still out of reach.
        setStatus({
          tone: "error",
          text: `Could not create “${sale.invoice_number}”: ${message} It is still saved offline.`,
        });
      }
    } catch (error) {
      console.error("Error creating open sale:", error);
      setStatus({
        tone: "error",
        text: `Unexpected error while creating “${sale.invoice_number}”.`,
      });
    } finally {
      syncingRef.current = false;
      setSyncingSale(null);
    }
  };

  /**
   * Commits an edit back onto the queue.
   *
   * The position is resolved here, against the queue as it stands now, rather
   * than being captured when the modal opened — the same identity lookup the
   * list itself uses. A sale synced or deleted while the editor was open is no
   * longer there to write to, and saying so beats silently patching whichever
   * sale slid into its place.
   */
  const handleSaveOffline = (updated) => {
    const index = sales.indexOf(editingSale);
    if (index === -1) {
      setStatus({
        tone: "error",
        text: "That queued sale is no longer in the queue — your changes were not saved.",
      });
      setEditingSale(null);
      return;
    }

    const updatedSales = [...sales];
    updatedSales[index] = {
      ...updatedSales[index],
      invoice_number: updated.invoice_number.trim(),
      items: updated.items,
      customer_name: updated.customer_name?.trim() || null,
    };

    // This used to write to "offlineSales" while every other access used
    // "offline_sales", so the edit was reported as saved and then vanished on
    // reload. Both now go through the one shared key.
    if (!persist(updatedSales)) {
      setStatus({ tone: "error", text: "Failed to update the queued sale." });
      return;
    }
    setEditingSale(null);
    setStatus({ tone: "ok", text: "Queued sale updated." });
  };

  const visibleSales = useMemo(() => filterSales(sales, query), [sales, query]);

  return (
    <div className="max-w-7xl mx-auto mt-6 p-4 sm:p-6 pb-28">
      <h1 className="text-2xl sm:text-3xl font-bold mb-5 text-gray-800 dark:text-gray-100">
        Offline Sales
      </h1>

      {/* Catalog status — what this page is selling from, and how stale it is */}
      <div className="mb-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm">
          <p className="font-semibold text-gray-700 dark:text-gray-200">
            Catalog: {inventory.length} items, {services.length} services
          </p>
          <p className="text-gray-500 dark:text-gray-400">
            {lastSyncedAt
              ? `Last synced: ${formatDateTime(lastSyncedAt)}`
              : "Never synced — using built-in defaults. Refresh while online to load the real prices."}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshCatalog}
          disabled={isRefreshing}
          className="px-4 min-h-11 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors whitespace-nowrap"
        >
          {isRefreshing ? "Refreshing…" : "⟳ Refresh catalog"}
        </button>
      </div>

      {isSeed && (
        <div className="mb-4 p-3 rounded-lg border border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 text-sm text-orange-800 dark:text-orange-300">
          ⚠️ These are built-in default items and prices, not your actual
          inventory. Connect to the internet and press “Refresh catalog” before
          taking sales.
        </div>
      )}

      {catalogError && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 text-sm text-red-700 dark:text-red-300"
        >
          {catalogError}
        </div>
      )}

      {status && (
        <div
          role="status"
          className={`mb-4 p-3 rounded-lg border text-sm flex items-start justify-between gap-3 ${
            status.tone === "ok"
              ? "border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300"
              : "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300"
          }`}
        >
          <span>{status.text}</span>
          <button
            type="button"
            onClick={() => setStatus(null)}
            aria-label="Dismiss message"
            className="flex-shrink-0 px-1 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      <div className="mb-5 p-4 bg-yellow-50 dark:bg-yellow-900/40 border border-yellow-300 dark:border-yellow-800 rounded-lg shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <label
          htmlFor="offline-invoice"
          className="font-semibold text-gray-700 dark:text-gray-200"
        >
          Invoice Number:
        </label>
        <input
          id="offline-invoice"
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
          className="border border-gray-300 dark:border-gray-700 rounded-md px-2 min-h-11 text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-800 w-full sm:w-40 text-center font-mono"
        />
      </div>

      <CatalogGrid
        inventory={inventory}
        services={services}
        onAddItem={addInventoryToCart}
        onAddService={addServiceToCart}
      />

      {/* STORED SALES LIST */}
      <div className="mt-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-800 dark:text-gray-100">
            Saved Offline Sales
          </h2>
          {sales.length > 0 && (
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search invoice, customer, or item…"
              ariaLabel="Search offline sales"
              className="w-full sm:w-72"
            />
          )}
        </div>

        {visibleSales.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center italic py-8">
            {sales.length === 0
              ? "No offline sales yet."
              : `No offline sales match “${query}”.`}
          </p>
        ) : (
          <div className="space-y-4">
            {visibleSales.map((s) => {
              // Position in the underlying queue, not the filtered view. Used for
              // the key only — every mutation below identifies the sale by the
              // element itself, since positions shift as sales sync.
              const i = sales.indexOf(s);
              const isSyncing = syncingSale === s;

              return (
                <div key={`${s.invoice_number}-${i}`} className={saleCardClass}>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                      Invoice #{s.invoice_number}
                    </h3>

                    {s.customer_name && (
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-0.5">
                        {s.customer_name}
                      </p>
                    )}

                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      Date:{" "}
                      <span className="font-medium dark:text-gray-300">
                        {formatDateTime(s.date)}
                      </span>
                    </p>

                    <p className="text-gray-700 dark:text-gray-200 font-medium mt-1">
                      Total:{" "}
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">
                        {formatCurrency(saleTotal(s))}
                      </span>
                    </p>

                    {/* Marked, not folded away — a price-0 freebie is still
                        stock leaving the shelf. Same as the other two lists. */}
                    <ul className="mt-2 text-sm text-gray-600 dark:text-gray-300 list-disc pl-5 space-y-0.5">
                      {(s.items || []).map((it, idx) => (
                        <li
                          key={idx}
                          className={
                            isFreeLine(it)
                              ? "text-green-600 dark:text-green-400"
                              : ""
                          }
                        >
                          {it.type === "service"
                            ? `${it.service_name} ×${it.qty || 1}`
                            : `${it.item_name} ×${it.qty || 1}`}
                          {isFreeLine(it) && " (free)"}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className={saleActionsClass}>
                    <button
                      type="button"
                      onClick={() => handleCreateOpenSale(s)}
                      disabled={syncingSale !== null}
                      className={`${rowActionClass(rowActionAccents.yellow)} disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {isSyncing ? "Creating…" : "Create Open Sale"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSale(s)}
                      className={rowActionClass(rowActionAccents.blue)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => printInvoice(s, shop)}
                      className={rowActionClass(rowActionAccents.purple)}
                    >
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingSale(s)}
                      className={rowActionClass(rowActionAccents.red)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
        checkoutLabel="Save Offline"
        title={`Cart · ${invoiceNumber}`}
      />

      <ConfirmDialog
        open={freebieGaps !== null}
        title="Unused freebie"
        message="Are you sure you want to save this sale? One of your services has a freebie that is unused."
        details={freebieGaps ? describeFreebieGaps(freebieGaps) : []}
        confirmLabel="Save Anyway"
        cancelLabel="Go Back"
        onCancel={() => setFreebieGaps(null)}
        onConfirm={() => {
          setFreebieGaps(null);
          saveOffline();
        }}
      />

      {/* The same editor the online list uses, so a queued sale's lines,
          quantities and freebie picks are as editable here as they are there —
          they used to be frozen, and the only remedy was Delete and re-cart.
          `allowInvoiceEdit` is the one difference: a queued sale carries a number
          allocated offline, and the receipt in the customer's hand shows it, so it
          has to be correctable before the sale is printed or synced. */}
      <EditSaleModal
        allowInvoiceEdit
        sale={editingSale}
        onClose={() => setEditingSale(null)}
        onSave={handleSaveOffline}
        inventory={inventory}
        services={services}
      />

      {/* The sale is already on the server at this point — there is nothing to
          confirm or undo. What's left is telling the cashier that the receipt they
          printed offline no longer matches, and putting the corrected one one tap
          away. "Reprint" is the confirm action because it is the thing that still
          needs doing. */}
      <ConfirmDialog
        open={reassigned !== null}
        title="Invoice number changed"
        accent="yellow"
        message={
          reassigned
            ? `Invoice ${reassigned.requested} was already taken on the server, so this sale was opened as ${reassigned.created.invoice_number} instead.\n\nPlease reprint the receipt — the one printed offline shows ${reassigned.requested}.`
            : ""
        }
        confirmLabel="Reprint Receipt"
        cancelLabel="Close"
        onCancel={() => setReassigned(null)}
        onConfirm={() => {
          // The server's row, not the queued one: it carries the number the sale
          // actually has and a real created_at.
          printInvoice(reassigned.created, shop);
          setReassigned(null);
        }}
      />

      <ConfirmDialog
        open={deletingSale !== null}
        title="Confirm Delete"
        accent="red"
        message={`Delete Invoice #${
          deletingSale?.invoice_number ?? ""
        }? This cannot be undone.`}
        confirmLabel="Yes, Delete"
        cancelLabel="Cancel"
        onCancel={() => setDeletingSale(null)}
        onConfirm={() => {
          removeFromQueue(deletingSale);
          setDeletingSale(null);
        }}
      />
    </div>
  );
};

export default OpenSalesOffline;
