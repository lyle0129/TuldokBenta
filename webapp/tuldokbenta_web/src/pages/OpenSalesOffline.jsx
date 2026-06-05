import { useState, useEffect } from "react";
import { useSales } from "../hooks/useSales";

const OpenSalesOffline = () => {
  // Add near the other useState calls at top of component
  const [viewingSale, setViewingSale] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [deletingIndex, setDeletingIndex] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { createOpenSale } = useSales();



  // 🧩 Placeholder inventory & services
  const [inventory] = useState([
    { id: 1, item_name: "[Detergent] Ariel", item_classification: "Detergent", price: 15, stock: 10 },
    { id: 2, item_name: "[Detergent] Tide", item_classification: "Detergent", price: 15, stock: 20 },
    { id: 3, item_name: "[Detergent] Surf", item_classification: "Detergent", price: 15, stock: 15 },
    { id: 4, item_name: "[Detergent] Breeze", item_classification: "Detergent", price: 15, stock: 10 },
    { id: 5, item_name: "[Detergent] Champion", item_classification: "Detergent", price: 15, stock: 20 },
    { id: 6, item_name: "[Fabcon] Downy Pink", item_classification: "Fabcon", price: 15, stock: 15 },
    { id: 8, item_name: "[Fabcon] Downy Blue", item_classification: "Fabcon", price: 15, stock: 10 },
    { id: 9, item_name: "[Fabcon] Surf", item_classification: "Fabcon", price: 15, stock: 20 },
    { id: 10, item_name: "[Fabcon] Champion", item_classification: "Fabcon", price: 15, stock: 15 },
    { id: 11, item_name: "[Fabcon] Del", item_classification: "Fabcon", price: 15, stock: 10 },
    { id: 12, item_name: "Bleach", item_classification: "bleach", price: 10, stock: 15 },
    { id: 13, item_name: "Plastic", item_classification: "Plastic", price: 3, stock: 10 },

  ]);

  const [services] = useState([
    { id: 1, service_name: "Full Service", price: 170.00, freebies: [
        "Plastic",
        "Detergent",
        "Fabcon"
      ] },
    { id: 2, service_name: "Wash", price: 60.00, freebies: [] },
    { id: 3, service_name: "Dry", price: 60.00, freebies: [] },
    { id: 4, service_name: "Extra Wash", price: 30.00, freebies: [] },
    { id: 5, service_name: "Extra Dry", price: 30.00, freebies: [] },
    { id: 6, service_name: "Fold", price: 20, freebies: [] },
  ]);

  const [cart, setCart] = useState([]);
  const [sales, setSales] = useState([]);
  const [invoiceNumber, setInvoiceNumber] = useState("INV-0001");

  // 🧠 Load sales and next invoice from localStorage
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("offline_sales")) || [];
    setSales(stored);

    if (stored.length > 0) {
      const numbers = stored
        .map((s) => parseInt(s.invoice_number.replace("INV-", ""), 10))
        .filter((n) => !isNaN(n));
      const max = numbers.length > 0 ? Math.max(...numbers) : 0;
      const next = String(max + 1).padStart(4, "0");
      setInvoiceNumber(`INV-${next}`);
    }
  }, []);

  // 🛒 Cart Management
  const addInventoryToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find(
        (i) => i.type === "inventory" && i.id === item.id
      );
      if (existing) {
        return prev.map((i) =>
          i.id === item.id && i.type === "inventory"
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [
        ...prev,
        {
          type: "inventory",
          id: item.id,
          name: item.item_name,
          price: item.price,
          quantity: 1,
        },
      ];
    });
  };

  const addServiceToCart = (service) => {
    setCart((prev) => {
      const existing = prev.find(
        (i) => i.type === "service" && i.id === service.id
      );
      if (existing) {
        return prev.map((i) =>
          i.id === service.id && i.type === "service"
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [
        ...prev,
        {
          type: "service",
          id: service.id,
          name: service.service_name,
          price: service.price,
          quantity: 1,
          freebies: service.freebies.map((cls) => ({
            classification: cls,
            choices: [],
          })),
        },
      ];
    });
  };

  // 🎁 FREEBIE HELPERS
  const addFreebieChoice = (itemId, classification) => {
    setCart((prev) =>
      prev.map((cartItem) =>
        cartItem.id === itemId && cartItem.type === "service"
          ? {
              ...cartItem,
              freebies: cartItem.freebies.map((f) =>
                f.classification === classification
                  ? {
                      ...f,
                      choices: [...(f.choices || []), { item: "", qty: 1 }],
                    }
                  : f
              ),
            }
          : cartItem
      )
    );
  };

  const updateFreebieChoice = (itemId, classification, itemName, cIdx) => {
    setCart((prev) =>
      prev.map((cartItem) =>
        cartItem.id === itemId && cartItem.type === "service"
          ? {
              ...cartItem,
              freebies: cartItem.freebies.map((f) =>
                f.classification === classification
                  ? {
                      ...f,
                      choices: f.choices.map((c, i) =>
                        i === cIdx ? { ...c, item: itemName } : c
                      ),
                    }
                  : f
              ),
            }
          : cartItem
      )
    );
  };

  const updateFreebieQuantity = (itemId, classification, cIdx, qty) => {
    setCart((prev) =>
      prev.map((cartItem) => {
        if (cartItem.id === itemId && cartItem.type === "service") {
          return {
            ...cartItem,
            freebies: cartItem.freebies.map((f) => {
              if (f.classification === classification) {
                const totalOther = f.choices.reduce(
                  (sum, c, i) => (i === cIdx ? sum : sum + c.qty),
                  0
                );
                const maxAllowed = cartItem.quantity - totalOther;
                return {
                  ...f,
                  choices: f.choices.map((c, i) =>
                    i === cIdx
                      ? { ...c, qty: Math.min(qty, maxAllowed) }
                      : c
                  ),
                };
              }
              return f;
            }),
          };
        }
        return cartItem;
      })
    );
  };

  const removeFreebieChoice = (itemId, classification, cIdx) => {
    setCart((prev) =>
      prev.map((cartItem) =>
        cartItem.id === itemId && cartItem.type === "service"
          ? {
              ...cartItem,
              freebies: cartItem.freebies.map((f) =>
                f.classification === classification
                  ? {
                      ...f,
                      choices: f.choices.filter((_, i) => i !== cIdx),
                    }
                  : f
              ),
            }
          : cartItem
      )
    );
  };

  const updateQuantity = (id, type, change) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === id && item.type === type
            ? { ...item, quantity: Math.max(item.quantity + change, 1) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  // 💾 Save to localStorage
  const handleCheckout = () => {
    if (cart.length === 0) return alert("Cart is empty!");

    const items = cart.flatMap((i) => {
      if (i.type === "inventory") {
        return [
          { type: "item", item_name: i.name, qty: i.quantity, price: i.price },
        ];
      } else if (i.type === "service") {
        const serviceEntry = {
          type: "service",
          service_name: i.name,
          qty: i.quantity,
          price: i.price,
        };
        const freebieEntries =
          i.freebies?.flatMap((f) =>
            f.choices
              ?.filter((c) => c.item)
              .map((c) => ({
                type: "item",
                item_name: c.item,
                qty: c.qty,
                price: 0,
              })) || []
          ) || [];
        return [serviceEntry, ...freebieEntries];
      }
      return [];
    });

    const sale = { invoice_number: invoiceNumber, items, date: new Date().toISOString() };

    const updatedSales = [...sales, sale];
    setSales(updatedSales);
    localStorage.setItem("offline_sales", JSON.stringify(updatedSales));

    // Increment invoice
    const nextNum = parseInt(invoiceNumber.replace("INV-", ""), 10) + 1;
    setInvoiceNumber(`INV-${String(nextNum).padStart(4, "0")}`);

    setCart([]);
    alert("Sale saved offline!");
  };

  // 🗑 Delete stored sale
  const deleteSale = (idx) => {
    const updated = sales.filter((_, i) => i !== idx);
    setSales(updated);
    localStorage.setItem("offline_sales", JSON.stringify(updated));
  };

  // 💰 Total
  const total = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const handlePrint = (sale) => {
    const total = sale.items.reduce(
      (sum, it) => sum + Number(it.price) * (it.qty || 1),
      0
    );
  
    // Generate HTML for items and freebies
    const itemsHtml = sale.items
      .map((it) => {
        const itemName = it.type === "service" ? it.service_name : it.item_name;
        const qty = it.qty || 1;
        const price = (Number(it.price) * qty).toFixed(2);
  
        let freebiesHtml = "";
        if (it.freebies && it.freebies.length > 0) {
          freebiesHtml = it.freebies
            .map((f) =>
              f.choices
                .map(
                  (c) =>
                    `<div style="display:flex;justify-content:space-between;padding-left:10px;font-size:11px;">
                      <span>+ ${c.item} x${c.qty}</span>
                      <span>FREE</span>
                    </div>`
                )
                .join("")
            )
            .join("");
        }
  
        return `
          <div style="margin-bottom:4px;">
            <div style="display:flex;justify-content:space-between;">
              <span>${itemName} x${qty}</span>
              <span>${price}</span>
            </div>
            ${freebiesHtml}
          </div>
        `;
      })
      .join("");
  
    const newPage = window.open("", "_blank", "width=600,height=800");
  
    newPage.document.open();
    newPage.document.write(`
      <html>
        <head>
          <title>Invoice #${sale.invoice_number}</title>
          <style>
            body {
              font-family: monospace;
              font-size: 12px;
              width: 58mm;
              margin: 0;
              padding: 1px;
            }
            hr {
              border: 0;
              border-top: 1px dashed #000;
              margin: 4px 0;
            }
          </style>
        </head>
        <body>
          <!-- Logo -->
          <div style="text-align:center;margin-bottom:4px;">
            <img src="https://i.ibb.co/NFtDrgj/SPINCREDIBLE.png" 
                 alt="SPINCREDIBLE Logo" 
                 style="max-width:50mm;width:100%;height:auto;margin-bottom:6px;" />
          </div>
  
          <!-- Store Details -->
          <div style="text-align:center;margin-bottom:8px;">
            <h2 style="font-size:14px;margin:0;">SPINCREDIBLE</h2>
            <p style="margin:0;">Rizal Street Ext</p>
            <p style="margin:0;">Mo: 0962-683-7430</p>
          </div>
  
          <p>Invoice #: ${sale.invoice_number}</p>
          <p>Date: ${new Date(sale.created_at).toLocaleString()}</p>
          ${
            sale.paid_at
              ? `<p>Paid: ${new Date(sale.paid_at).toLocaleString()}</p>`
              : ""
          }
          <hr />
  
          <!-- Items -->
          ${itemsHtml}
          <hr />
  
          <!-- Total -->
          <div style="display:flex;justify-content:space-between;font-weight:bold;">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
          <hr />
  
          <!-- Footer -->
          <p style="text-align:center;margin-top:12px;">
            Thank you for your purchase!
          </p>
  
          <!-- Print Button -->
          <button style="
            display:block;
            margin:15px auto;
            padding:8px 16px;
            font-size:14px;
            background-color:#4f46e5;
            color:white;
            border:none;
            border-radius:6px;
            cursor:pointer;
          " onclick="window.print()">Print Invoice</button>
        </body>
      </html>
    `);
    newPage.document.close();
  };

  const handleCreateOpenSale = async (sale, index) => {
    try {
      const openSaleData = {
        invoice_number: sale.invoice_number,
        items: sale.items,
        total: sale.items.reduce(
          (sum, i) => sum + Number(i.price || 0) * Number(i.qty || 1),
          0
        ),
        created_at: sale.date || new Date().toISOString(),
      };
  
      const success = await createOpenSale(openSaleData);
  
      if (success) {
        const updatedSales = sales.filter((_, i) => i !== index);
        setSales(updatedSales);
  
        // ✅ FIXED: use the same key as your delete function
        localStorage.setItem("offline_sales", JSON.stringify(updatedSales));
  
        alert(
          `✅ Open Sale “${sale.invoice_number}” successfully created and removed from offline storage.`
        );
      } else {
        alert(
          `❌ Failed to create Open Sale “${sale.invoice_number}”. Please try again.`
        );
      }
    } catch (error) {
      console.error("Error creating open sale:", error);
      alert(
        `⚠️ An unexpected error occurred while creating Open Sale “${sale.invoice_number}”.`
      );
    }
  };
  
  
  const updateOfflineSaleInvoice = (index, newInvoice) => {
    try {
      const updatedSales = [...sales];
      updatedSales[index] = {
        ...updatedSales[index],
        invoice_number: newInvoice,
      };
  
      setSales(updatedSales);
      localStorage.setItem("offlineSales", JSON.stringify(updatedSales));
      alert("Invoice number updated successfully!");
      return true;
    } catch (error) {
      console.error("Error updating offline sale invoice:", error);
      alert("Failed to update invoice number.");
      return false;
    }
  };

  return (
    <div className="max-w-7xl mx-auto mt-8 p-4 sm:p-6">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100 text-center sm:text-left">
        Offline Sales
      </h1>

      <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-800 rounded-lg shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <label className="font-semibold text-gray-700 dark:text-gray-200">
          Invoice Number:
        </label>
        <input
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
          className="border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-800 w-40 text-center font-mono"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* INVENTORY */}
        <section>
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">
            Inventory
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {inventory.map((item) => (
              <div
                key={item.id}
                className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-transform hover:-translate-y-1"
              >
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">
                  {item.item_name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {item.item_classification}
                </p>
                <p className="mt-1 font-semibold text-gray-700 dark:text-gray-200">
                  ₱{item.price}
                </p>
                <button
                  onClick={() => addInventoryToCart(item)}
                  className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md text-sm font-medium transition"
                >
                  Add to Cart
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* SERVICES */}
        <section>
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">
            Services
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {services.map((service) => (
              <div
                key={service.id}
                className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-transform hover:-translate-y-1"
              >
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">
                  {service.service_name}
                </h3>
                <p className="mt-1 font-semibold text-gray-700 dark:text-gray-200">
                  ₱{service.price}
                </p>
                {service.freebies.length > 0 && (
                  <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                    Includes freebies: {service.freebies.join(", ")}
                  </p>
                )}
                <button
                  onClick={() => addServiceToCart(service)}
                  className="mt-3 w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-md text-sm font-medium transition"
                >
                  Add to Cart
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* CART */}
        <section>
        <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">
            Cart
        </h2>

        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-4 space-y-4 border border-gray-200 dark:border-gray-700">
            {cart.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm text-center">
                No items in cart.
            </p>
            ) : (
            <>
                {/* Total */}
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                <span className="font-semibold text-gray-800 dark:text-gray-100 text-lg">
                    Total
                </span>
                <span className="font-bold text-green-700 dark:text-green-400 text-xl">
                    ₱{total.toFixed(2)}
                </span>
                </div>

                {cart.map((item, idx) => (
                <div
                    key={idx}
                    className="border-b border-gray-200 dark:border-gray-700 pb-3 flex justify-between items-start text-sm"
                >
                    <div className="flex-1 pr-2">
                    <h3 className="font-medium text-gray-800 dark:text-gray-100">
                        {item.name}
                    </h3>

                    {/* Quantity Controls */}
                    <div className="flex items-center gap-2 mt-1">
                        <button
                        onClick={() => updateQuantity(item.id, item.type, -1)}
                        className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                        >
                        –
                        </button>
                        <span className="text-gray-700 dark:text-gray-200">
                        {item.quantity}
                        </span>
                        <button
                        onClick={() => updateQuantity(item.id, item.type, +1)}
                        className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                        >
                        +
                        </button>
                    </div>

                    {/* 🎁 Freebies */}
                    {item.type === "service" && item.freebies.length > 0 && (
                        <div className="mt-2 space-y-2">
                        {item.freebies.map((f, fIdx) => {
                            const totalUsed =
                            f.choices?.reduce((sum, c) => sum + c.qty, 0) || 0;
                            const remaining = item.quantity - totalUsed;

                            return (
                            <div key={fIdx}>
                                <label className="block text-gray-600 dark:text-gray-400 text-xs mb-1">
                                {f.classification} ({remaining} remaining)
                                </label>

                                {f.choices.map((choice, cIdx) => (
                                <div
                                    key={cIdx}
                                    className="flex items-center gap-2 mb-2"
                                >
                                    <select
                                    value={choice.item}
                                    onChange={(e) =>
                                        updateFreebieChoice(
                                        item.id,
                                        f.classification,
                                        e.target.value,
                                        cIdx
                                        )
                                    }
                                    className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                                    >
                                    <option value="">-- Select --</option>
                                    {inventory
                                        .filter(
                                        (inv) =>
                                            inv.item_classification ===
                                            f.classification
                                        )
                                        .map((inv) => (
                                        <option key={inv.id} value={inv.item_name}>
                                            {inv.item_name}
                                        </option>
                                        ))}
                                    </select>

                                    <input
                                    type="number"
                                    min="1"
                                    max={item.quantity}
                                    value={choice.qty}
                                    onChange={(e) =>
                                        updateFreebieQuantity(
                                        item.id,
                                        f.classification,
                                        cIdx,
                                        Number(e.target.value)
                                        )
                                    }
                                    className="w-14 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded px-1 py-1 text-center focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                                    />

                                    <button
                                    onClick={() =>
                                        removeFreebieChoice(
                                        item.id,
                                        f.classification,
                                        cIdx
                                        )
                                    }
                                    className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition"
                                    >
                                    ✕
                                    </button>
                                </div>
                                ))}

                                {remaining > 0 && (
                                <button
                                    onClick={() =>
                                    addFreebieChoice(item.id, f.classification)
                                    }
                                    className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                                >
                                    + Add {f.classification}
                                </button>
                                )}
                            </div>
                            );
                        })}
                        </div>
                    )}
                    </div>

                    <div className="flex flex-col items-end">
                    <span className="font-semibold text-gray-700 dark:text-gray-200">
                        ₱{(item.price * item.quantity).toFixed(2)}
                    </span>
                    <button
                        onClick={() =>
                        setCart((prev) =>
                            prev.filter(
                            (cartItem) =>
                                !(
                                cartItem.id === item.id &&
                                cartItem.type === item.type
                                )
                            )
                        )
                        }
                        className="mt-1 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-xs transition"
                    >
                        Remove
                    </button>
                    </div>
                </div>
                ))}
            </>
            )}
        </div>

        {/* Save Offline Button */}
        {cart.length > 0 && (
            <button
            onClick={handleCheckout}
            className="mt-4 w-full bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white py-2 rounded-md font-medium transition"
            >
            Save Offline
            </button>
        )}
        </section>

      </div>

      {/* STORED SALES LIST (refactored: View + Delete) */}
        <div className="mt-8">
        <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">
            Saved Offline Sales
        </h2>

        {sales.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No offline sales yet.</p>
        ) : (
            <div className="space-y-4">
            {sales.map((s, i) => {
                const total = (s.items || []).reduce(
                (sum, it) => sum + Number(it.price || 0) * (it.qty || 1),
                0
                );

                return (
                <div
                    key={i}
                    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 hover:shadow-md transition-shadow duration-200"
                >
                    <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                        Invoice #{s.invoice_number}
                    </h3>

                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Date:{" "}
                        <span className="font-medium dark:text-gray-300">
                        {s.date ? new Date(s.date).toLocaleString() : "—"}
                        </span>
                    </p>

                    <p className="text-gray-700 dark:text-gray-200 font-medium mt-1">
                        Total:{" "}
                        <span className="text-blue-600 dark:text-blue-400 font-semibold">
                        ₱{total.toFixed(2)}
                        </span>
                    </p>

                    <ul className="mt-2 text-sm text-gray-600 dark:text-gray-300 list-disc pl-5 space-y-0.5">
                        {(s.items || []).map((it, idx) => (
                        <li key={idx}>
                            {it.type === "service"
                            ? `${it.service_name} ×${it.qty || 1}`
                            : `${it.item_name} ×${it.qty || 1}`}
                        </li>
                        ))}
                    </ul>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2 sm:gap-3">
                    <button
                        onClick={() => handleCreateOpenSale(s, i)}
                        className="px-3 py-1.5 bg-yellow-500 text-white rounded-md text-sm font-medium hover:bg-yellow-600 transition-colors shadow-sm"
                        >
                        Create Open Sale
                    </button>
                    <button
                        onClick={() => {
                        setViewingSale({ ...s, index: i }); // 👈 store the sale's index
                        setShowViewModal(true);
                        }}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                    >
                        View
                    </button>

                    <button
                        onClick={() => handlePrint(s)}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors shadow-sm"
                    >
                        Print
                    </button>

                    <button
                        onClick={() => {
                        setDeletingIndex(i);
                        setShowDeleteModal(true);
                        }}
                        className="px-3 py-1.5 bg-red-500 text-white rounded-md text-sm font-medium hover:bg-red-600 transition-colors shadow-sm"
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

        {/* VIEW MODAL */}
        {showViewModal && viewingSale && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg p-6 sm:p-8 transition-all border border-gray-200 dark:border-gray-700">
            
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                    Invoice
                </h2>
                {/* Editable Invoice Number */}
                <input
                    type="text"
                    value={viewingSale.invoice_number}
                    onChange={(e) =>
                    setViewingSale((prev) => ({ ...prev, invoice_number: e.target.value }))
                    }
                    className="mt-1 w-40 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-md px-2 py-1 text-gray-800 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                </div>
                <button
                onClick={() => {
                    setShowViewModal(false);
                    setViewingSale(null);
                }}
                className="text-gray-500 hover:text-gray-800 dark:text-gray-400"
                >
                ✕
                </button>
            </div>

            {/* Date */}
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Date:{" "}
                <span className="font-medium">
                {viewingSale.date
                    ? new Date(viewingSale.date).toLocaleString()
                    : "—"}
                </span>
            </p>

            {/* Items */}
            <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3 max-h-72 overflow-y-auto pr-1">
                {(viewingSale.items || []).map((it, idx) => {
                const name =
                    it.type === "service" ? it.service_name : it.item_name;
                const qty = it.qty || 1;
                const price = Number(it.price || 0);
                return (
                    <div key={idx} className="flex justify-between items-center">
                    <div>
                        <div className="font-medium text-gray-800 dark:text-gray-100">
                        {name}{" "}
                        <span className="text-xs text-gray-500">×{qty}</span>
                        </div>
                        {/* show freebies if present */}
                        {it.freebies?.length > 0 && (
                        <div className="text-xs text-gray-600 dark:text-gray-300 pl-2 mt-1">
                            {it.freebies.map((f, fi) =>
                            f.choices?.map((c, ci) => (
                                <div
                                key={`${fi}-${ci}`}
                                className="flex justify-between text-xs"
                                >
                                <span>
                                    + {c.item} ×{c.qty}
                                </span>
                                <span className="ml-2">FREE</span>
                                </div>
                            ))
                            )}
                        </div>
                        )}
                    </div>
                    <div className="font-semibold">
                        ₱{(price * qty).toFixed(2)}
                    </div>
                    </div>
                );
                })}
            </div>

            {/* Total */}
            <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4 flex justify-between items-center">
                <div className="font-medium text-gray-700 dark:text-gray-200">
                Total
                </div>
                <div className="font-bold text-lg text-blue-600 dark:text-blue-400">
                ₱
                {((viewingSale.items || []).reduce(
                    (sum, it) => sum + Number(it.price || 0) * (it.qty || 1),
                    0
                )).toFixed(2)}
                </div>
            </div>

            {/* Buttons */}
            <div className="mt-6 flex justify-end gap-3">
                <button
                onClick={() => {
                    setShowViewModal(false);
                    setViewingSale(null);
                }}
                className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                Close
                </button>

                <button
                onClick={() => {
                    updateOfflineSaleInvoice(viewingSale.index, viewingSale.invoice_number);
                    setShowViewModal(false);
                }}
                className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                Save
                </button>
            </div>
            </div>
        </div>
        )}


        {/* DELETE CONFIRMATION MODAL */}
        {showDeleteModal && deletingIndex !== null && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md p-6 sm:p-8 transition-all border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-red-600">Confirm Delete</h3>
            <p className="text-gray-700 dark:text-gray-300 mt-2">
                Are you sure you want to delete <strong>Invoice #{sales[deletingIndex]?.invoice_number}</strong>? This cannot be undone.
            </p>

            <div className="mt-6 flex justify-end gap-3">
                <button
                onClick={() => {
                    setShowDeleteModal(false);
                    setDeletingIndex(null);
                }}
                className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                Cancel
                </button>

                <button
                onClick={() => {
                    // call your delete function
                    deleteSale(deletingIndex);
                    setShowDeleteModal(false);
                    setDeletingIndex(null);
                }}
                className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
                >
                Yes, Delete
                </button>
            </div>
            </div>
        </div>
        )}

    </div>
  );
};

export default OpenSalesOffline;
