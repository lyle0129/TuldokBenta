import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import ChartTooltip from "./ChartTooltip";

/**
 * Collected, booked and outstanding over time.
 *
 * Collected and booked are *flows* — money that moved during each period — and
 * routinely diverge: a sale opened Monday and paid Tuesday lifts Monday's
 * booked line and Tuesday's collected line. Plotting only one of them was what
 * made the old chart disagree with the cards above it.
 *
 * Outstanding is a *stock*: not money that moved, but money owed at the instant
 * each period ended. It gets its own right-hand axis for exactly that reason —
 * a shared axis would invite reading a debt balance against a day's takings as
 * if they were comparable quantities.
 */
const RevenueTrendChart = ({ chartData, granularity }) => (
  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 transition-colors">
    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
      Collected, booked and outstanding ({granularity})
    </h3>
    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
      Bars and lines on the left are money that moved in each period. Outstanding
      on the right is the balance still owed when the period ended.
    </p>
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis dataKey="displayPeriod" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="flow" tick={{ fontSize: 12 }} width={70} />
          <YAxis
            yAxisId="stock"
            orientation="right"
            tick={{ fontSize: 12 }}
            width={70}
          />
          <Tooltip content={<ChartTooltip money />} />
          <Legend />

          {/* Drawn first so the two flow lines sit on top of it. */}
          <Area
            yAxisId="stock"
            type="monotone"
            dataKey="outstanding"
            stroke="#F59E0B"
            strokeWidth={2}
            fill="#F59E0B"
            fillOpacity={0.12}
            name="Outstanding"
          />
          <Line
            yAxisId="flow"
            type="monotone"
            dataKey="collected"
            stroke="#10B981"
            strokeWidth={3}
            dot={{ fill: "#10B981", strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, stroke: "#10B981", strokeWidth: 2 }}
            name="Collected"
          />
          <Line
            yAxisId="flow"
            type="monotone"
            dataKey="booked"
            stroke="#3B82F6"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ fill: "#3B82F6", strokeWidth: 2, r: 3 }}
            name="Booked"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  </div>
);

export default RevenueTrendChart;
