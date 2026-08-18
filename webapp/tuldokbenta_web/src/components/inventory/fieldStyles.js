// components/inventory/fieldStyles.js
// The one form-control recipe the inventory modals share, so a field in Add
// looks identical to the same field in Edit. Matches SearchInput's input so the
// toolbar and the modals read as one form language.

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
