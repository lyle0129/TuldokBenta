import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { usePaymentMethods } from "../../hooks/usePaymentMethods";
import {
  PAYMENT_COLORS as COLORS,
  buildMethodLookup,
  resolveMethod,
} from "../../utils/paymentMethods";
import { formatCurrency } from "../../utils/format";
import ChartTooltip from "./ChartTooltip";

/**
 * How the money collected in the range split across payment methods.
 *
 * Only closed sales reach here, so every slice is cash that actually arrived.
 */
const PaymentBreakdownChart = ({ paymentMethodBreakdown = {} }) => {
  const { paymentMethods } = usePaymentMethods();
  const lookup = useMemo(
    () => buildMethodLookup(paymentMethods),
    [paymentMethods]
  );

  const rows = useMemo(
    () =>
      Object.entries(paymentMethodBreakdown)
        .map(([code, data]) => ({
          code,
          ...resolveMethod(lookup, code),
          value: data.total,
          count: data.count,
        }))
        .sort((a, b) => b.value - a.value),
    [paymentMethodBreakdown, lookup]
  );

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 transition-colors">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
        Payment methods
      </h3>

      {rows.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center italic py-8">
          No payments in this range.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={80}
                  dataKey="value"
                  nameKey="label"
                >
                  {rows.map((row, index) => (
                    <Cell
                      key={row.code}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip money />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
            {/* `row` is kept whole and the icon rendered as `row.Icon`: the
                lint config has no eslint-plugin-react, so a destructured
                component used only as a JSX tag reads as unused. */}
            {rows.map((row) => (
              <li
                key={row.code}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h4 className="font-medium text-gray-800 dark:text-gray-100 truncate">
                    {row.label}
                  </h4>
                  <row.Icon
                    size={20}
                    aria-hidden="true"
                    className="flex-shrink-0 text-gray-500 dark:text-gray-400"
                  />
                </div>
                <p className="font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(row.value)}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {row.count} {row.count === 1 ? "payment" : "payments"} · avg{" "}
                  {formatCurrency(row.value / row.count)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PaymentBreakdownChart;
