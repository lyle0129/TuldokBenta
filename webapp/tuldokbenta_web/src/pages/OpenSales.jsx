// pages/OpenSales.jsx
import { useState, useEffect } from "react";
import { useInventory } from "../hooks/useInventory";
import { useServices } from "../hooks/useServices";
import { useSales } from "../hooks/useSales";
import Invoice from "../components/Invoice";
import ListSales from "../components/ListSales";

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

  const [cart, setCart] = useState([]);
  const [nextInvoice, setNextInvoice] = useState("INV-001");

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

  // ✅ Checkout
  const handleCheckout = async () => {
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

    const sale = { invoice_number: nextInvoice, items };
    const success = await createOpenSale(sale);
    if (success) setCart([]);
  };

  return (
        <div className="max-w-7xl mx-auto mt-8 p-4 sm:p-6">
          <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100 text-center sm:text-left">
            Open Sales
          </h1>

          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                Next Invoice:
              </span>{" "}
              <span className="text-blue-700 dark:text-blue-400 font-semibold">
                {nextInvoice}
              </span>
            </div>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* INVENTORY SECTION */}
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
                    <p
                      className={`text-sm mt-1 ${
                        item.stock === 0
                          ? "text-red-600 dark:text-red-400 font-semibold"
                          : "text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      Stock: {item.stock}
                    </p>
                    <button
                      onClick={() => addInventoryToCart(item)}
                      className="mt-3 w-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white dark:bg-blue-500 dark:hover:bg-blue-600 py-2 rounded-md text-sm font-medium transition"
                    >
                      Add to Cart
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* SERVICES SECTION */}
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
                    {service.freebies?.length > 0 && (
                      <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                        Includes freebies: {service.freebies.join(", ")}
                      </p>
                    )}
                    <button
                      onClick={() => addServiceToCart(service)}
                      className="mt-3 w-full bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 active:scale-95 text-white py-2 rounded-md text-sm font-medium transition"
                    >
                      Add to Cart
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* CART SECTION */}
            <section>
              <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">
                Cart
              </h2>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 space-y-4 border border-gray-200 dark:border-gray-700">
                {cart.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-sm text-center">
                    No items in cart.
                  </p>
                ) : (
                  <>
                    <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                      <span className="font-semibold text-gray-800 dark:text-gray-100 text-lg">
                        Total
                      </span>
                      <span className="font-bold text-green-700 dark:text-green-400 text-xl">
                      ₱
                        {cart
                          .reduce(
                            (sum, item) => sum + item.price * item.quantity,
                            0
                          )
                          .toFixed(2)}
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
                          <div className="flex items-center gap-2 mt-1">
                            <button
                              onClick={() => updateQuantity(item.id, item.type, -1)}
                              className="px-2 py-1 bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded hover:bg-gray-300"
                            >
                              –
                            </button>
                            <span className="text-gray-800 dark:text-gray-100">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(item.id, item.type, +1)}
                              className="px-2 py-1 bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded hover:bg-gray-300"
                            >
                              +
                            </button>
                          </div>

                          {/* Freebies */}
                          {item.type === "service" && item.freebies.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {item.freebies.map((f, fIdx) => {
                                const freebieSlots = item.quantity;
                                const totalUsed =
                                  f.choices?.reduce((sum, c) => sum + c.qty, 0) || 0;
                                const remaining = freebieSlots - totalUsed;

                                return (
                                  <div key={fIdx}>
                                    <label className="block text-gray-600 dark:text-gray-400 text-xs mb-1">
                                      {f.classification} ({remaining} remaining)
                                    </label>

                                    {f.choices?.map((choice, cIdx) => (
                                      <div
                                        key={cIdx}
                                        className="flex items-center gap-2 mb-2"
                                      >
                                        <select
                                          value={choice.item || ""}
                                          onChange={(e) =>
                                            updateFreebieChoice(
                                              item.id,
                                              f.classification,
                                              e.target.value,
                                              cIdx
                                            )
                                          }
                                          className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded px-2 py-1 text-sm"
                                        >
                                          <option value="">-- Select --</option>
                                          {inventory
                                            .filter(
                                              (inv) =>
                                                inv.item_classification ===
                                                f.classification
                                            )
                                            .map((inv) => (
                                              <option
                                                key={inv.id}
                                                value={inv.item_name}
                                              >
                                                {inv.item_name}
                                              </option>
                                            ))}
                                        </select>

                                        <input
                                          type="number"
                                          min="1"
                                          max={freebieSlots}
                                          value={choice.qty}
                                          onChange={(e) =>
                                            updateFreebieQuantity(
                                              item.id,
                                              f.classification,
                                              cIdx,
                                              Number(e.target.value)
                                            )
                                          }
                                          className="w-14 border border-gray-300 dark:border-gray-600 rounded px-1 py-1 text-center bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                                        />

                                        <button
                                          onClick={() =>
                                            removeFreebieChoice(
                                              item.id,
                                              f.classification,
                                              cIdx
                                            )
                                          }
                                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
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
                                        className="px-2 py-1 bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded hover:bg-gray-300 text-xs text-gray-700 dark:text-gray-200"
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
                            className="mt-1 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-xs"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {cart.length > 0 && (
                <button
                  onClick={handleCheckout}
                  className="mt-4 w-full bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 active:scale-95 text-white py-2 rounded-md font-medium transition"
                >
                  Checkout
                </button>
              )}
            </section>
          </div>

          <ListSales
            openSales={openSales}
            deleteOpenSale={deleteOpenSale}
            updateOpenSale={updateOpenSale}
            paySale={paySale}
            loadSales={loadSales}
            inventory={inventory}
            services={services}
          />
        </div>

  );
};

export default OpenSales;
