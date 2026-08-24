// components/open-sales/CartModal.jsx
import Modal from "../shared/Modal";
import FreebieEditor from "./FreebieEditor";
import QuantityStepper from "../shared/QuantityStepper";
import { labelClass, inputClass } from "../shared/fieldStyles";
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
  customerName = "",
  onCustomerNameChange,
  onCheckout,
  checkoutLabel = "Checkout",
  isSubmitting = false,
  errorMessage = null,
  title = "Cart",
}) => {
  const total = cartTotal(cart);

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

      {/* Above the lines, because it belongs to the sale rather than to any one
          of them — and because it is the field most easily forgotten once the
          total is on screen. Optional: a sale with no name is still a sale. */}
      {onCustomerNameChange && (
        <div className="mb-4">
          <label htmlFor="cart-customer-name" className={labelClass}>
            Customer <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input
            id="cart-customer-name"
            type="text"
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            placeholder="Who is this sale for?"
            maxLength={255}
            className={inputClass}
          />
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

              {/* `onUpdateQuantity` takes a delta, so the absolute value the
                  stepper reports is turned back into one here. Clamped first:
                  typing over the field yields "", and a bare Number("") would
                  read as "take one off". */}
              <QuantityStepper
                className="mt-2"
                value={item.quantity}
                onChange={(next) => {
                  const qty = Math.max(1, Math.floor(Number(next) || 1));
                  if (qty !== item.quantity) {
                    onUpdateQuantity(item.id, item.type, qty - item.quantity);
                  }
                }}
                label={`Quantity of ${item.name}`}
                decreaseLabel={`Decrease quantity of ${item.name}`}
                increaseLabel={`Increase quantity of ${item.name}`}
                focusRing="focus:ring-green-500"
              />

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
