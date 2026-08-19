import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import ChartTooltip from "./ChartTooltip";

/**
 * Transaction counts per period: how many were opened, how many were paid.
 *
 * The counterpart to RevenueTrendChart — same buckets, same attribution rule,
 * measured in sales rather than pesos.
 */
const SalesVolumeChart = ({ chartData, granularity }) => (
  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 transition-colors">
    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
      Sales volume ({granularity})
    </h3>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis dataKey="displayPeriod" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Legend />
          <Bar
            dataKey="openedCount"
            fill="#3B82F6"
            name="Opened"
            radius={[2, 2, 0, 0]}
          />
          <Bar
            dataKey="paidCount"
            fill="#10B981"
            name="Paid"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

export default SalesVolumeChart;
