import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Banknote, Smartphone, CreditCard, Wallet } from 'lucide-react';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

const PaymentBreakdownChart = ({ paymentMethodBreakdown, formatCurrency }) => {
  if (Object.keys(paymentMethodBreakdown).length === 0) {
    return null;
  }

  const safeFormatCurrency = (value) => formatCurrency(Number(value) || 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Payment Methods Distribution
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={Object.entries(paymentMethodBreakdown).map(([method, data], index) => ({
                  name: method,
                  value: data.total,
                  count: data.count,
                  color: COLORS[index % COLORS.length]
                }))}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {Object.entries(paymentMethodBreakdown).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name, props) => [
                  safeFormatCurrency(value),
                  `${name} (${props.payload.count} transactions)`
                ]}
                contentStyle={{
                  backgroundColor: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(paymentMethodBreakdown).map(([method, data]) => (
            <div key={method} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-900 dark:text-gray-100 capitalize">
                  {method}
                </h4>
                <span className="text-2xl">
                  {method.toLowerCase() === 'cash' ? <Banknote size={24} /> :
                   method.toLowerCase() === 'gcash' ? <Smartphone size={24} /> :
                   method.toLowerCase() === 'card' ? <CreditCard size={24} /> : <Wallet size={24} />}
                </span>
              </div>
              <div className="space-y-1">
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {safeFormatCurrency(data.total)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {data.count} transaction{data.count !== 1 ? 's' : ''}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500">
                  Avg: {safeFormatCurrency(data.total / data.count)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PaymentBreakdownChart;
