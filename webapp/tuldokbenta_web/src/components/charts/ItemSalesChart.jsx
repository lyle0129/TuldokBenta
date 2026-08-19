import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { PAYMENT_COLORS as COLORS } from "../../utils/paymentMethods";
import ChartTooltip from "./ChartTooltip";

/**
 * Share of units moved, by item.
 *
 * Reduced to the chart alone: the per-item figures it used to duplicate in a
 * side list now live in the BreakdownPanel below it, and the show/hide toggles
 * that list carried forced an early `return null` above this component's hooks
 * — a rules-of-hooks violation that only survived because the empty case was
 * stable. With no state left there is nothing to return early from.
 *
 * @param {object} props
 * @param {{name: string, qty: number, total: number}[]} props.items
 * @param {number} [props.limit] slices to draw; the rest are grouped as "Other"
 */
const ItemSalesChart = ({ items = [], limit = 8 }) => {
  const rows = useMemo(() => {
    const byQty = [...items].sort((a, b) => b.qty - a.qty);
    const top = byQty.slice(0, limit);
    const rest = byQty.slice(limit);

    // Rolled into one slice rather than dropped, so the pie still adds up to
    // every unit sold.
    if (rest.length > 0) {
      top.push({
        name: `Other (${rest.length})`,
        qty: rest.reduce((sum, item) => sum + item.qty, 0),
        total: rest.reduce((sum, item) => sum + item.total, 0),
      });
    }
    return top;
  }, [items, limit]);

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 transition-colors">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
        Items by units sold
      </h3>

      {rows.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center italic py-8">
          No items sold in this range.
        </p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) =>
                  `${name.length > 15 ? `${name.slice(0, 12)}…` : name} ${(percent * 100).toFixed(0)}%`
                }
                outerRadius={80}
                dataKey="qty"
                nameKey="name"
              >
                {rows.map((row, index) => (
                  <Cell key={row.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default ItemSalesChart;
