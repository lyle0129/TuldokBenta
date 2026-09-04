// components/shared/fieldStyles.js
// The one form-control recipe the admin modals share, so a field on Inventory
// looks identical to the same field on Services. Matches SearchInput's input,
// which is what ties the toolbars and the modals together.

export const labelClass =
  "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

export const inputClass =
  "w-full min-h-11 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none transition-colors";

/** The app-wide error banner, same markup as the one in CartModal. */
export const alertClass =
  "rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-300";

/** Amber sibling of alertClass, for "this is legal but check it" notices. */
export const noticeClass =
  "rounded-md border border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 px-4 py-2 text-sm text-orange-700 dark:text-orange-300";

export const cancelButtonClass =
  "px-4 py-2.5 min-h-11 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors";

/** Filled primary action. Pass the accent's own colour classes. */
export const submitButtonClass = (colors) =>
  `px-4 py-2.5 min-h-11 rounded-md text-white font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${colors}`;

// ---------------------------------------------------------------------------
// List rows
//
// Every list in the app renders cards, not tables, and every card is the same
// shape: details on the left, a block of actions on the right. Open Sales,
// Offline Sales and Closed Sales each grew their own card and their own button
// size — one of them at py-1.5, roughly 30px tall, well under the 44px target
// every other control in the app meets. These are the closed-sales recipe,
// which was the only one that already met it, lifted out.
//
// This is the recipe for *all* of them — sales, inventory, services, payment
// methods, shops, users. Reach for these rather than writing a sixth copy: the
// four non-sales lists each held their own duplicate for a while, and every one
// of them missed the overflow fix below.
// ---------------------------------------------------------------------------

/** The card one row is rendered in. */
export const rowCardClass =
  "border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 bg-white dark:bg-gray-800 hover:shadow-md transition";

/**
 * The block those actions sit in: two per row on a phone, a column from `sm:`
 * up. A single flex row overflowed the card — a `flex-1` item can't shrink past
 * its own label, so three to five buttons ran off the side of the screen.
 * `grid-cols-2` is `minmax(0, 1fr)`, which can.
 */
export const rowActionsClass =
  "grid grid-cols-2 sm:flex sm:flex-col gap-2 text-sm sm:flex-shrink-0";

/**
 * One action button. Pass an entry from `rowActionAccents`.
 *
 * `min-w-0` is what lets the grid cell above actually shrink; `leading-tight`
 * and `text-center` are what keep a label that wraps to two lines looking
 * deliberate rather than broken. `gap-1.5` spaces a leading icon from its label
 * and does nothing on the buttons that are text alone.
 */
export const rowActionClass = (accent) =>
  `flex-1 sm:flex-none min-w-0 flex items-center justify-center gap-1.5 text-center px-4 py-2 min-h-11 rounded-md border font-medium leading-tight transition disabled:opacity-40 disabled:cursor-not-allowed ${accent}`;

/**
 * One accent per kind of action, so Print is the same colour on every sales
 * page and a cashier moving between them isn't relearning the buttons.
 *
 * yellow — moves a sale between tables (Revert, Create Open Sale), and edit
 * blue   — edit
 * green  — take money, and bring something back (Reactivate)
 * purple — print, and anything that shows the printed document
 * red    — destroy
 * gray   — retire without destroying (Deactivate)
 *
 * gray and green are a pair: the same button is gray while a row is active and
 * green while it is not, so Deactivate and Reactivate never look alike.
 */
export const rowActionAccents = {
  yellow:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-yellow-200 dark:border-yellow-700 hover:bg-yellow-200 dark:hover:bg-yellow-800",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-700 hover:bg-blue-200 dark:hover:bg-blue-800",
  green:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-700 hover:bg-green-200 dark:hover:bg-green-800",
  purple:
    "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200 border-purple-200 dark:border-purple-700 hover:bg-purple-200 dark:hover:bg-purple-800",
  red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-200 dark:border-red-700 hover:bg-red-200 dark:hover:bg-red-800",
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600",
};
