// pages/OpenSales.js
import { useState, useEffect, useRef } from "react";
import { useReactToPrint } from "react-to-print";
import { useInventory } from "../hooks/useInventory";
import { useServices } from "../hooks/useServices";
import { useSales } from "../hooks/useSales";
import Invoice from "../components/Invoice"; 

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

  // For Modal editing open sale
  const [editingSale, setEditingSale] = useState(null);
  const [showModal, setShowModal] = useState(false);  
  const [payingSale, setPayingSale] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("");

  // For Printing
  const [invoiceSale, setInvoiceSale] = useState(null);
  const invoiceRef = useRef();
  const handlePrint = useReactToPrint({
    content: () => invoiceRef.current,
  });

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

  // Modal Edit sale
  const updateModalFreebieChoice = (saleIdx, classification, cIdx, itemName) => {
    setEditingSale((prev) => {
      const updated = { ...prev };
      const f = updated.items[saleIdx].freebies.find(
        (fb) => fb.classification === classification
      );
      f.choices[cIdx].item = itemName;
      return updated;
    });
  };
  
  const updateModalFreebieQuantity = (saleIdx, classification, cIdx, qty) => {
    setEditingSale((prev) => {
      const updated = { ...prev };
      const item = updated.items[saleIdx];
      const f = item.freebies.find((fb) => fb.classification === classification);
  
      const totalOther = f.choices.reduce(
        (sum, c, i) => (i === cIdx ? sum : sum + c.qty),
        0
      );
      const maxAllowed = item.qty - totalOther;
  
      f.choices[cIdx].qty = Math.min(qty, maxAllowed);
      return updated;
    });
  };
  
  const addModalFreebieChoice = (saleIdx, classification) => {
    setEditingSale((prev) => {
      const updated = { ...prev };
      const f = updated.items[saleIdx].freebies.find(
        (fb) => fb.classification === classification
      );
      f.choices.push({ item: "", qty: 1 });
      return updated;
    });
  };
  
  const removeModalFreebieChoice = (saleIdx, classification, cIdx) => {
    setEditingSale((prev) => {
      const updated = { ...prev };
      const f = updated.items[saleIdx].freebies.find(
        (fb) => fb.classification === classification
      );
      f.choices = f.choices.filter((_, i) => i !== cIdx);
      return updated;
    });
  };
  

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
                                          <option key={inv._id} value={inv.item_name}>
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
      <div className="mt-10">
        <h2 className="text-2xl font-semibold mb-4">Saved Open Sales</h2>
        {openSales.length === 0 ? (
          <p className="text-gray-500">No open sales yet.</p>
        ) : (
          <div className="space-y-4">
            {openSales.map((sale) => {
              // ✅ Compute total dynamically
              const total = sale.items.reduce(
                (sum, it) => sum + Number(it.price) * (it.qty || 1),
                0
              );

              return (
                <div
                  key={sale.id}
                  className="border rounded-lg shadow p-4 flex justify-between items-center"
                >
                  <div>
                    <h3 className="font-semibold">
                      Invoice #{sale.invoice_number}
                    </h3>
                    <p>Total: ${total.toFixed(2)}</p>

                    <ul className="text-sm text-gray-600 list-disc pl-5">
                      {sale.items.map((it, i) => (
                        <li key={i}>
                          {it.type === "service"
                            ? `${it.service_name} x${it.qty || 1}`
                            : `${it.item_name} x${it.qty || 1}`}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        setEditingSale(JSON.parse(JSON.stringify(sale))); // clone so we can edit safely
                        setShowModal(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteOpenSale(sale.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>
                    {/* Pay sale */}
                    <button
                      onClick={() => setPayingSale(sale)}
                      className="text-purple-600 hover:text-purple-800 text-sm"
                    >
                      Pay
                    </button>

                    {/* Print button */}
                    <button
                      onClick={() => {
                        setInvoiceSale(sale); // store selected sale
                        setTimeout(handlePrint, 100); // ensure ref is updated before printing
                      }}
                      className="text-green-600 hover:text-green-800 text-sm"
                    >
                      Print Receipt
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>
      {showModal && editingSale && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-6">
          <h2 className="text-xl font-semibold mb-4">
            Edit Invoice #{editingSale.invoice_number}
          </h2>

          {/* Editable Items List */}
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {editingSale.items.map((it, idx) => (
            <div key={idx} className="border-b pb-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium">
                    {it.type === "service" ? it.service_name : it.item_name}
                  </p>
                  <input
                    type="number"
                    min="1"
                    value={it.qty}
                    onChange={(e) => {
                      const newQty = Number(e.target.value);
                      setEditingSale((prev) => {
                        const updated = { ...prev };
                        updated.items[idx].qty = newQty;
                        return updated;
                      });
                    }}
                    className="mt-1 border rounded px-2 py-1 w-20"
                  />
                </div>
                <span className="font-semibold">
                  ${(Number(it.price) * Number(it.qty)).toFixed(2)}
                </span>
              </div>

              {/* Freebie Editor for services */}
              {it.type === "service" && it.freebies?.length > 0 && (
                <div className="mt-3 space-y-3">
                  {it.freebies.map((f, fIdx) => {
                    const freebieSlots = it.qty;
                    const totalUsed =
                      f.choices?.reduce((sum, c) => sum + c.qty, 0) || 0;
                    const remaining = freebieSlots - totalUsed;

                    return (
                      <div key={fIdx}>
                        <label className="block text-sm text-gray-600 mb-1">
                          Choose {f.classification} ({freebieSlots} free):
                        </label>

                        {f.choices?.map((choice, cIdx) => (
                          <div
                            key={cIdx}
                            className="flex items-center space-x-2 mb-2"
                          >
                            <select
                              value={choice.item || ""}
                              onChange={(e) =>
                                updateModalFreebieChoice(
                                  idx,
                                  f.classification,
                                  cIdx,
                                  e.target.value
                                )
                              }
                              className="flex-1 border px-2 py-1 rounded-md"
                            >
                              <option value="">-- Select --</option>
                              {inventory
                                .filter(
                                  (inv) =>
                                    inv.item_classification === f.classification
                                )
                                .map((inv) => (
                                  <option key={inv._id} value={inv.item_name}>
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
                                updateModalFreebieQuantity(
                                  idx,
                                  f.classification,
                                  cIdx,
                                  Number(e.target.value)
                                )
                              }
                              className="w-16 border px-2 py-1 rounded-md"
                            />

                            <button
                              onClick={() =>
                                removeModalFreebieChoice(
                                  idx,
                                  f.classification,
                                  cIdx
                                )
                              }
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              ✕
                            </button>
                          </div>
                        ))}

                        {remaining > 0 && (
                          <button
                            onClick={() =>
                              addModalFreebieChoice(idx, f.classification)
                            }
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
          ))}
        </div>

          {/* Modal Actions */}
          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={() => setShowModal(false)}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
            onClick={async () => {
              // 🔄 You'll need updateOpenSale in your useSales hook
              const success = await updateOpenSale(editingSale.id, editingSale);
              if (success) {
                setShowModal(false);
                loadSales();
              }
            }}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Save Changes
          </button>
          </div>
        </div>
      </div>
    )}
    {payingSale && (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-xl font-semibold mb-4">
          Pay Invoice #{payingSale.invoice_number}
        </h2>

        <div className="space-y-4">
          <label className="block">
            <span className="text-gray-700">Select Payment Method:</span>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="mt-1 block w-full border rounded px-3 py-2"
            >
              <option value="">-- Select Method --</option>
              <option value="cash">Cash</option>
              {/* <option value="card">Card</option> */}
              <option value="gcash">GCash</option>
            </select>
          </label>
        </div>

        {/* Modal actions */}
        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={() => {
              setPayingSale(null);
              setPaymentMethod("");
            }}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            disabled={!paymentMethod}
            onClick={async () => {
              await paySale(payingSale.id, paymentMethod);
              setPayingSale(null);
              setPaymentMethod("");
              loadSales(); // refresh list after paying
            }}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  )}

    {/* Hidden printable invoice */}
    <div style={{ display: "none" }}>
      {invoiceSale && <Invoice ref={invoiceRef} sale={invoiceSale} />}
    </div>
    </div>
  );
};

export default OpenSales;
