// pages/OpenSales.js
import { useState, useEffect } from "react";
import { useInventory } from "../hooks/useInventory";
import { useServices } from "../hooks/useServices";
import { useSales } from "../hooks/useSales";

const OpenSales = () => {
  const { inventory, loadInventory } = useInventory();
  const { services, loadServices } = useServices();
  const { openSales, loadSales, createOpenSale, deleteOpenSale } = useSales();

  const [cart, setCart] = useState([]);
  const [nextInvoice, setNextInvoice] = useState("INV-001");

  useEffect(() => {
    loadInventory();
    loadServices();
    loadSales();
  }, [loadInventory, loadServices, loadSales]);

  // 🔢 Generate next invoice number whenever openSales changes
  useEffect(() => {
    if (openSales.length > 0) {
      // get the highest invoice_number
      const numbers = openSales
        .map((s) => s.invoice_number)
        .filter(Boolean)
        .map((inv) => parseInt(inv.replace("INV-", ""), 10));

      const max = numbers.length > 0 ? Math.max(...numbers) : 0;
      const next = String(max + 1).padStart(3, "0");
      setNextInvoice(`INV-${next}`);
    } else {
      setNextInvoice("INV-001");
    }
  }, [openSales]);

  // Add inventory item to cart
  const addInventoryToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.type === "inventory" && i.id === item._id);
      if (existing) {
        return prev.map((i) =>
          i.id === item._id && i.type === "inventory"
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [
        ...prev,
        {
          type: "inventory",
          id: item._id,
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
            choice: null,
          })),
        },
      ];
    });
  };

  // Update freebie choice
  const updateFreebieChoice = (serviceId, classification, choice) => {
    setCart((prev) =>
      prev.map((item) =>
        item.type === "service" && item.id === serviceId
          ? {
              ...item,
              freebies: item.freebies.map((f) =>
                f.classification === classification ? { ...f, choice } : f
              ),
            }
          : item
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
        i.freebies?.filter((f) => f.choice).map((f) => ({
          type: "item",
          item_name: f.choice,
          qty: i.quantity, // same qty as the service
          price: 0,
        })) || [];

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
                key={item._id}
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
              cart.map((item, idx) => (
                <div key={idx} className="border-b pb-2 flex justify-between items-start">
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
                        {item.freebies.map((f, fIdx) => (
                          <div key={fIdx}>
                            <label className="block text-sm text-gray-600 mb-1">
                              Choose {f.classification}:
                            </label>
                            <select
                              value={f.choice || ""}
                              onChange={(e) =>
                                updateFreebieChoice(item.id, f.classification, e.target.value)
                              }
                              className="w-full border px-2 py-1 rounded-md"
                            >
                              <option value="">-- Select --</option>
                              {inventory
                                .filter((inv) => inv.item_classification === f.classification)
                                .map((inv) => (
                                  <option key={inv._id} value={inv.item_name}>
                                    {inv.item_name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        ))}
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
                            (cartItem) => !(cartItem.id === item.id && cartItem.type === item.type)
                          )
                        )
                      }
                      className="mt-2 text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
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
      <div className="mt-10">
        <h2 className="text-2xl font-semibold mb-4">Saved Open Sales</h2>
        {openSales.length === 0 ? (
          <p className="text-gray-500">No open sales yet.</p>
        ) : (
          <div className="space-y-4">
            {openSales.map((sale) => (
              <div
                key={sale._id}
                className="border rounded-lg shadow p-4 flex justify-between items-center"
              >
                <div>
                  <h3 className="font-semibold">Sale #{sale._id}</h3>
                  <p>Total: ${sale.total}</p>
                  <ul className="text-sm text-gray-600 list-disc pl-5">
                    {sale.items.map((it, i) => (
                      <li key={i}>
                        {it.name} x{it.quantity}
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={() => deleteOpenSale(sale._id)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OpenSales;
