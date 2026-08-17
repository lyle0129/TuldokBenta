// hooks/useCart.js
import { useState } from "react";

/**
 * Encapsulates all cart state and mutation logic shared between
 * OpenSales and OpenSalesOffline.
 *
 * @returns {{
 *   cart: CartItem[],
 *   addInventoryToCart: (item: InventoryItem) => void,
 *   addServiceToCart: (service: ServiceItem) => void,
 *   addFreebieChoice: (itemId: number, classification: string) => void,
 *   updateFreebieChoice: (itemId: number, classification: string, itemName: string, cIdx: number) => void,
 *   updateFreebieQuantity: (itemId: number, classification: string, cIdx: number, qty: number) => void,
 *   removeFreebieChoice: (itemId: number, classification: string, cIdx: number) => void,
 *   updateQuantity: (id: number, type: string, change: number) => void,
 *   clearCart: () => void,
 * }}
 */
export function useCart() {
  const [cart, setCart] = useState([]);

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
          // `freebies` is JSONB on the server and can come back null, so don't
          // assume the array the hardcoded catalog always provided.
          freebies: (service.freebies || []).map((cls) => ({
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

  const clearCart = () => setCart([]);

  const removeItem = (id, type) => {
    setCart((prev) =>
      prev.filter((cartItem) => !(cartItem.id === id && cartItem.type === type))
    );
  };

  return {
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
  };
}
