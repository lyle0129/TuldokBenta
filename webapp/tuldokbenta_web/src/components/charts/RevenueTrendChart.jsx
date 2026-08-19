import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import ChartTooltip from "./ChartTooltip";

/**
 * Collected against booked over time.
 *
 * Two lines rather than one "revenue", because they answer different questions
 * and routinely diverge: a sale opened Monday and paid Tuesday lifts Monday's
 * booked line and Tuesday's collected line. Plotting only one of them was what
 * made the old chart disagree with the cards above it.
 */
const RevenueTrendChart = ({ chartData, granularity }) => (
  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 transition-colors">
    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
      Collected vs booked ({granularity})
    </h3>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis dataKey="displayPeriod" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} width={70} />
          <Tooltip content={<ChartTooltip money />} />
          <Legend />
          <Line
            type="monotone"
            dataKey="collected"
            stroke="#10B981"
            strokeWidth={3}
            dot={{ fill: "#10B981", strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, stroke: "#10B981", strokeWidth: 2 }}
            name="Collected"
          />
          <Line
            type="monotone"
            dataKey="booked"
            stroke="#3B82F6"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ fill: "#3B82F6", strokeWidth: 2, r: 3 }}
            name="Booked"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);

export default RevenueTrendChart;
