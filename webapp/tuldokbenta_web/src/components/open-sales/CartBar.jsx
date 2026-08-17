// components/open-sales/CartBar.jsx
import { ShoppingCart } from "lucide-react";
import { formatCurrency } from "../../utils/format";
import { cartTotal, cartCount } from "../../utils/cart";

/**
 * Sticky bar that keeps the cart reachable from anywhere on the page.
 *
 * Previously the cart was the third column of a desktop grid, which on a phone
 * meant scrolling past the whole catalog to see what you'd just added.
 */
const CartBar = ({ cart, onOpen }) => {
  if (cart.length === 0) return null;

  const count = cartCount(cart);

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ShoppingCart
            size={20}
            aria-hidden="true"
            className="text-green-600 dark:text-green-400 flex-shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
              {count} {count === 1 ? "item" : "items"}
            </p>
            <p className="text-lg font-bold text-green-700 dark:text-green-400 leading-tight">
              {formatCurrency(cartTotal(cart))}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="ml-auto flex-shrink-0 px-6 min-h-12 rounded-lg bg-green-600 hover:bg-green-700 active:scale-95 text-white font-semibold transition"
        >
          View Cart
        </button>
      </div>
    </div>
  );
};

export default CartBar;
