// utils/cartDirty.js
// Whether a sale is part-built somewhere on screen.
//
// Exists for exactly one question: the shop picker must confirm before a switch
// discards a cart (ticket 08, requirement 5.4). The cart itself lives in
// useCart's useState inside OpenSales and OpenSalesOffline, and the picker sits
// in the navbar — a sibling, not an ancestor — so it cannot read that state.
//
// A one-boolean module rather than a context provider around the whole app. The
// picker only ever needs the answer at the moment of a click, never as something
// to re-render on, so there is nothing here for React to subscribe to and no
// reason to make every page re-render when a line is added to a cart.

let dirty = false;

/** Set by useCart whenever its emptiness changes. */
export const setCartDirty = (value) => {
  dirty = Boolean(value);
};

/** @returns {boolean} true if a cart currently holds at least one line */
export const isCartDirty = () => dirty;
