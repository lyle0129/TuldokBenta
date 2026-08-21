// hooks/useCart.js
import { useState } from "react";
import { clampFreebieChoices } from "../utils/freebies";

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

  /**
   * Sets one freebie choice's quantity, then re-spends the classification's
   * whole budget so the picks still fit the service quantity.
   *
   * Capping this one choice against the others was nearly right but produced a
   * qty of 0 (or less) once the other picks had taken every slot — a freebie
   * row that occupies a slot and delivers nothing, which the server then
   * rejects the entire sale over. Re-spending in order instead lets an earlier
   * pick grow into the slots a later one gives up, and never leaves a row at 0.
   */
  const updateFreebieQuantity = (itemId, classification, cIdx, qty) => {
    setCart((prev) =>
      prev.map((cartItem) => {
        if (cartItem.id === itemId && cartItem.type === "service") {
          return {
            ...cartItem,
            freebies: cartItem.freebies.map((f) => {
              if (f.classification === classification) {
                const requested = {
                  ...f,
                  choices: f.choices.map((c, i) =>
                    i === cIdx
                      ? { ...c, qty: Math.max(1, Math.floor(Number(qty) || 1)) }
                      : c
                  ),
                };
                return clampFreebieChoices([requested], cartItem.quantity)[0];
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
        .map((item) => {
          if (item.id !== id || item.type !== type) return item;

          const quantity = Math.max(item.quantity + change, 1);
          // Lowering a service's quantity strands any freebie claimed against
          // the slots that just went away, and each one is a real price-0 line
          // the backend deducts stock for.
          return Array.isArray(item.freebies)
            ? {
                ...item,
                quantity,
                freebies: clampFreebieChoices(item.freebies, quantity),
              }
            : { ...item, quantity };
        })
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
