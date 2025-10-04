// pages/OpenSales.js
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

  // Add inventory item to cart
  const addInventoryToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.type === "inventory" && i.id === item.id);
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

  // Add service to cart
  const addServiceToCart = (service) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.type === "service" && i.id === service.id);
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
            choices: [], // always use choices array
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
                      choices: [...(f.choices || []), { item: "", qty: 1 }]
                    }
                  : f
              )
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
                      )
                    }
                  : f
              )
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
                    i === cIdx ? { ...c, qty: Math.min(qty, maxAllowed) } : c
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
                      choices: f.choices.filter((_, i) => i !== cIdx)
                    }
                  : f
              )
            }
          : cartItem
      )
    );
  };
  

  // Update quantity
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

// ✅ Checkout (save to backend in desired format)
const handleCheckout = async () => {
  if (cart.length === 0) return alert("Cart is empty!");

  // Flatten freebies into separate "item" entries
  const items = cart.flatMap((i) => {
    if (i.type === "inventory") {
      return [
        {
          type: "item",
          item_name: i.name,
          qty: i.quantity,
          price: i.price,
        },
      ];
    } else if (i.type === "service") {
      const serviceEntry = {
        type: "service",
        service_name: i.name,
        qty: i.quantity,
        price: i.price,
      };

      // Convert freebies into "item" entries with price 0
      const freebieEntries =
      i.freebies?.flatMap((f) =>
        f.choices
          ?.filter((c) => c.item) // only keep selected items
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

  const sale = {
    invoice_number: nextInvoice,
    items,
  };

  const success = await createOpenSale(sale);
  if (success) {
    setCart([]);
  }
};

  return (
    <div className="max-w-7xl mx-auto mt-8 p-6">
    <h1 className="text-3xl font-bold mb-6">Open Sales</h1>

    <div className="mb-4 p-4 bg-gray-100 rounded">
      <span className="font-semibold">Next Invoice: </span>
      {nextInvoice}
    </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Inventory Section */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Inventory</h2>
          <div className="grid grid-cols-2 gap-4">
            {inventory.map((item) => (
              <div
                key={item.id}
                className="border rounded-lg shadow p-4 flex flex-col justify-between hover:shadow-md transition"
              >
                <h3 className="font-semibold">{item.item_name}</h3>
                <p className="text-sm text-gray-500">{item.item_classification}</p>
                <p className="mt-2 font-bold">${item.price}</p>
                <button
                  onClick={() => addInventoryToCart(item)}
                  className="mt-4 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
                >
                  Add to Cart
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Services Section */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Services</h2>
          <div className="grid grid-cols-1 gap-4">
            {services.map((service) => (
              <div
                key={service.id}
                className="border rounded-lg shadow p-4 flex flex-col justify-between hover:shadow-md transition"
              >
                <h3 className="font-semibold">{service.service_name}</h3>
                <p className="mt-1 font-bold">${service.price}</p>
                {service.freebies?.length > 0 && (
                  <p className="text-sm text-green-600 mt-1">
                    Includes freebies: {service.freebies.join(", ")}
                  </p>
                )}
                <button
                  onClick={() => addServiceToCart(service)}
                  className="mt-4 bg-purple-600 text-white py-2 rounded-md hover:bg-purple-700"
                >
                  Add to Cart
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Cart Section */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Cart</h2>
          <div className="bg-white rounded-lg shadow p-4 space-y-4">
            {cart.length === 0 ? (
              <p className="text-gray-500">No items in cart.</p>
            ) : (
              <>
                {/* ✅ Cart Total */}
                <div className="flex justify-between items-center border-b pb-2 mb-2">
                  <span className="font-semibold text-lg">Total</span>
                  <span className="font-bold text-xl">
                    $
                    {cart
                      .reduce((sum, item) => sum + item.price * item.quantity, 0)
                      .toFixed(2)}
                  </span>
                </div>

                {/* Cart Items */}
                {cart.map((item, idx) => (
                  <div
                    key={idx}
                    className="border-b pb-2 flex justify-between items-start"
                  >
                    <div className="flex-1">
                      <h3 className="font-medium">{item.name}</h3>

                      {/* Quantity Controls */}
                      <div className="flex items-center space-x-2 mt-1">
                        <button
                          onClick={() => updateQuantity(item.id, item.type, -1)}
                          className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                        >
                          –
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.type, +1)}
                          className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                        >
                          +
                        </button>
                      </div>

                      {/* Freebie dropdowns for services */}
                      {item.type === "service" && item.freebies.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {item.freebies.map((f, fIdx) => {
                            const freebieSlots = item.quantity; // how many freebies allowed
                            const totalUsed = f.choices?.reduce((sum, c) => sum + c.qty, 0) || 0;
                            const remaining = freebieSlots - totalUsed;

                            return (
                              <div key={fIdx}>
                                <label className="block text-sm text-gray-600 mb-1">
                                  Choose {f.classification} ({freebieSlots} free):
                                </label>

                                {/* Existing choices */}
                                {f.choices?.map((choice, cIdx) => (
                                  <div key={cIdx} className="flex items-center space-x-2 mb-2">
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
                                      className="flex-1 border px-2 py-1 rounded-md"
                                    >
                                      <option value="">-- Select --</option>
                                      {inventory
                                        .filter(
                                          (inv) => inv.item_classification === f.classification
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
                                      className="w-16 border px-2 py-1 rounded-md"
                                    />

                                    <button
                                      onClick={() =>
                                        removeFreebieChoice(item.id, f.classification, cIdx)
                                      }
                                      className="text-red-600 hover:text-red-800 text-sm"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}

                                {/* Add new choice if remaining slots */}
                                {remaining > 0 && (
                                  <button
                                    onClick={() => addFreebieChoice(item.id, f.classification)}
                                    className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
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

                    {/* Right side: Price + Delete */}
                    <div className="flex flex-col items-end">
                      <span className="font-semibold">
                        ${(item.price * item.quantity).toFixed(2)}
                      </span>
                      <button
                        onClick={() =>
                          setCart((prev) =>
                            prev.filter(
                              (cartItem) =>
                                !(
                                  cartItem.id === item.id && cartItem.type === item.type
                                )
                            )
                          )
                        }
                        className="mt-2 text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Checkout button */}
          {cart.length > 0 && (
            <button
              onClick={handleCheckout}
              className="mt-4 w-full bg-green-600 text-white py-2 rounded-md hover:bg-green-700"
            >
              Checkout
            </button>
          )}
        </div>

      </div>

      {/* List of Open Sales */}
      <ListSales
        openSales={openSales}
        deleteOpenSale={deleteOpenSale}
        updateOpenSale={updateOpenSale}
        paySale={paySale}
        loadSales={loadSales}
        inventory={inventory}
      />

    </div>
  );
};

export default OpenSales;
