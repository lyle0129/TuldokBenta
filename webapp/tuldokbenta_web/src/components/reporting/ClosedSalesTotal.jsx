import React, { useMemo } from "react";
import { usePaymentMethods } from "../../hooks/usePaymentMethods";
import {
  PAYMENT_COLORS,
  PAYMENT_ICONS,
  FALLBACK_ICON,
  resolveMethod,
  buildMethodLookup,
} from "../../utils/paymentMethods";

/**
 * Revenue split by how it was paid.
 *
 * This used to hold `{ cash: 0, gcash: 0 }` and render exactly two cards, so a
 * sale paid with anything else contributed ₱0 here with no indication it had
 * been dropped. Cards now come from the payment_methods table, and codes with
 * no active row are summed into a trailing "Other" card instead of vanishing.
 */
export default function ClosedSalesTotal({ closedSales, formatCurrency }) {
  const { paymentMethods, activeMethods } = usePaymentMethods();

  const { byCode, otherTotal } = useMemo(() => {
    const totals = {};
    closedSales.forEach((sale) => {
      const total = sale.items.reduce(
        (sum, i) => sum + i.price * (i.qty || 1),
        0
      );
      const code = sale.paid_using || "";
      totals[code] = (totals[code] || 0) + total;
    });

    const activeCodes = new Set(activeMethods.map((m) => m.code));
    const other = Object.entries(totals)
      .filter(([code]) => !activeCodes.has(code))
      .reduce((sum, [, amount]) => sum + amount, 0);

    return { byCode: totals, otherTotal: other };
  }, [closedSales, activeMethods]);

  // Only for the "Other" tooltip — retired methods still resolve to their label.
  const lookup = useMemo(
    () => buildMethodLookup(paymentMethods),
    [paymentMethods]
  );

  const otherCodes = useMemo(() => {
    const activeCodes = new Set(activeMethods.map((m) => m.code));
    return Object.keys(byCode)
      .filter((code) => !activeCodes.has(code) && byCode[code] !== 0)
      .map((code) => resolveMethod(lookup, code).label);
  }, [byCode, activeMethods, lookup]);

  return (
    <section className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
        Closed Sales Total by Payment Method
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeMethods.map((method, index) => {
          const Icon = PAYMENT_ICONS[method.icon] || FALLBACK_ICON;
          const color = PAYMENT_COLORS[index % PAYMENT_COLORS.length];

          return (
            <div
              key={method.id}
              className="p-3 bg-white dark:bg-gray-700 rounded-lg text-center border-t-4"
              style={{ borderTopColor: color }}
            >
              <p className="flex items-center justify-center gap-1.5 font-medium text-gray-700 dark:text-gray-200">
                <Icon size={16} aria-hidden="true" />
                {method.label}
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {formatCurrency(byCode[method.code] || 0)}
              </p>
            </div>
          );
        })}

        {otherTotal !== 0 && (
          <div
            className="p-3 bg-white dark:bg-gray-700 rounded-lg text-center border-t-4 border-t-gray-400 dark:border-t-gray-500"
            title={otherCodes.join(", ")}
          >
            <p className="font-medium text-gray-700 dark:text-gray-200">Other</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
              {formatCurrency(otherTotal)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
              {otherCodes.join(", ")}
            </p>
          </div>
        )}

        {activeMethods.length === 0 && otherTotal === 0 && (
          <p className="text-gray-500 dark:text-gray-400 italic">
            No payment methods configured.
          </p>
        )}
      </div>
    </section>
  );
}
