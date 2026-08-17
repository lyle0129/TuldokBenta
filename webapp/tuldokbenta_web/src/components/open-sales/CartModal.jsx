// components/open-sales/CartModal.jsx
import Modal from "../shared/Modal";
import FreebieEditor from "./FreebieEditor";
import { cartTotal } from "../../utils/cart";
import { formatCurrency } from "../../utils/format";

/**
 * The cart, as a full-screen sheet on mobile and a dialog on desktop.
 *
 * Purely presentational over `useCart` — every mutator is passed straight
 * through, so the online and offline pages share this without either of them
 * owning cart state.
 */
const CartModal = ({
  open,
  onClose,
  cart,
  inventory,
  onUpdateQuantity,
  onRemoveItem,
  onAddFreebieChoice,
  onChangeFreebieItem,
  onChangeFreebieQty,
  onRemoveFreebieChoice,
  onCheckout,
  checkoutLabel = "Checkout",
  isSubmitting = false,
  errorMessage = null,
  title = "Cart",
}) => {
  const total = cartTotal(cart);

  const stepperClass =
    "w-11 h-11 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 text-lg font-medium transition-colors";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      accent="green"
      size="xl"
      variant="sheet"
      footer={
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-800 dark:text-gray-100">Total</span>
            <span className="text-xl font-bold text-green-700 dark:text-green-400">
              {formatCurrency(total)}
            </span>
          </div>
          <button
            type="button"
            onClick={onCheckout}
            disabled={cart.length === 0 || isSubmitting}
            className="w-full min-h-12 rounded-lg bg-green-600 hover:bg-green-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 text-white font-semibold transition"
          >
            {isSubmitting ? "Saving…" : checkoutLabel}
          </button>
        </div>
      }
    >
      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-300"
        >
          {errorMessage}
        </div>
      )}

      {cart.length === 0 ? (
        <p className="py-10 text-center text-sm italic text-gray-500 dark:text-gray-400">
          Your cart is empty. Tap something in the catalog to add it.
        </p>
      ) : (
        <ul className="space-y-4">
          {cart.map((item) => (
            <li
              key={`${item.type}-${item.id}`}
              className="border-b border-gray-200 dark:border-gray-700 pb-4 last:border-b-0 last:pb-0"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 dark:text-gray-100">
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatCurrency(item.price)} each
                  </p>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="font-semibold text-gray-800 dark:text-gray-100">
                    {formatCurrency(item.price * item.quantity)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id, item.type)}
                    className="mt-1 text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(item.id, item.type, -1)}
                  aria-label={`Decrease quantity of ${item.name}`}
                  className={stepperClass}
                >
                  –
                </button>
                <span
                  aria-label={`Quantity of ${item.name}`}
                  className="w-10 text-center font-medium text-gray-800 dark:text-gray-100"
                >
                  {item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(item.id, item.type, +1)}
                  aria-label={`Increase quantity of ${item.name}`}
                  className={stepperClass}
                >
                  +
                </button>
              </div>

              {item.type === "service" && (
                <FreebieEditor
                  freebies={item.freebies || []}
                  slots={item.quantity}
                  inventory={inventory}
                  onAddChoice={(cls) => onAddFreebieChoice(item.id, cls)}
                  onChangeItem={(cls, cIdx, value) =>
                    onChangeFreebieItem(item.id, cls, value, cIdx)
                  }
                  onChangeQty={(cls, cIdx, value) =>
                    // Clamp here: emptying the field yields "" and Number("") is 0,
                    // which would silently zero out a claimed freebie.
                    onChangeFreebieQty(
                      item.id,
                      cls,
                      cIdx,
                      Math.max(1, Math.floor(Number(value) || 1))
                    )
                  }
                  onRemoveChoice={(cls, cIdx) => onRemoveFreebieChoice(item.id, cls, cIdx)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

export default CartModal;
