// utils/cart.js
// Derived figures over the cart shape produced by useCart.

/** Running total. Freebie picks are already priced at 0, so they add nothing. */
export const cartTotal = (cart = []) =>
  cart.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.quantity || 0), 0);

/** Units, not lines — "3 items" should mean three things, not three rows. */
export const cartCount = (cart = []) =>
  cart.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
