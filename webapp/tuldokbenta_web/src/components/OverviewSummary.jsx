import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Calendar,
  BarChart3,
  TrendingUp,
  FileText,
  CheckCircle,
  Diamond,
  Activity,
  RotateCcw,
  Package,
} from 'lucide-react';
import { useOverviewAnalytics } from '../hooks/useOverviewAnalytics';
import RevenueTrendChart from './charts/RevenueTrendChart';
import SalesVolumeChart from './charts/SalesVolumeChart';
import PaymentBreakdownChart from './charts/PaymentBreakdownChart';
import ItemSalesChart from './charts/ItemSalesChart';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

export default function OverviewSummary({
  openSales,
  closedSales,
  formatCurrency,
  filters = null,
  allOpenSales = null,
  allClosedSales = null,
}) {
  const [timePeriod, setTimePeriod] = useState('daily');

  const safeFormatCurrency = (value) => {
    const numValue = Number(value) || 0;
    return formatCurrency(numValue);
  };

  const timePeriodOptions = [
    { id: 'daily', label: 'Daily', icon: Calendar },
    { id: 'weekly', label: 'Weekly', icon: BarChart3 },
    { id: 'monthly', label: 'Monthly', icon: TrendingUp },
    { id: 'yearly', label: 'Yearly', icon: FileText },
  ];

  const {
    dateFilteredOpenSales,
    dateFilteredClosedSales,
    previousDaysPaidInRange,
    samePeriodCreatedAndPaid,
    analytics,
  } = useOverviewAnalytics({ openSales, closedSales, filters, allOpenSales, allClosedSales, timePeriod });

  return (
    <div className="space-y-6">
      {/* Time Period Selection */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Time Period Analysis
        </h3>
        <div className="flex flex-wrap gap-2">
          {timePeriodOptions.map(option => (
            <button
              key={option.id}
              onClick={() => setTimePeriod(option.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                timePeriod === option.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <option.icon size={16} />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Open Sales</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {dateFilteredOpenSales.length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                {safeFormatCurrency(analytics.openTotal)}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <FileText className="text-blue-600 dark:text-blue-400" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Closed Sales</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {dateFilteredClosedSales.length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                {safeFormatCurrency(analytics.closedTotal)}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle className="text-green-600 dark:text-green-400" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border-2 border-indigo-200 dark:border-indigo-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Sales</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {dateFilteredOpenSales.length + dateFilteredClosedSales.length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                {safeFormatCurrency(analytics.grandTotal)}
              </p>
            </div>
            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
              <Diamond className="text-indigo-600 dark:text-indigo-400" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Average Sale</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {safeFormatCurrency(
                  (dateFilteredOpenSales.length + dateFilteredClosedSales.length) > 0
                    ? analytics.grandTotal / (dateFilteredOpenSales.length + dateFilteredClosedSales.length)
                    : 0
                )}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">Per transaction</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
              <Activity className="text-purple-600 dark:text-purple-400" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Previous Days Paid in Range */}
      {previousDaysPaidInRange.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border-2 border-orange-200 dark:border-orange-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Previous Days Paid in Range
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Sales created before the date range but paid within it
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
              <RotateCcw className="text-orange-600 dark:text-orange-400" size={24} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {previousDaysPaidInRange.length}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Transactions</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                {safeFormatCurrency(
                  previousDaysPaidInRange.reduce((sum, sale) =>
                    sum + sale.items.reduce((a, i) => a + (Number(i.price) || 0) * (i.qty || 1), 0), 0
                  )
                )}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Amount</p>
            </div>
            <div className="text-center">
              <div className="space-y-1">
                {(() => {
                  const paymentBreakdown = {};
                  previousDaysPaidInRange.forEach(sale => {
                    const method = sale.paid_using || 'Unknown';
                    const amount = sale.items.reduce((sum, item) => sum + (Number(item.price) || 0) * (item.qty || 1), 0);
                    paymentBreakdown[method] = (paymentBreakdown[method] || 0) + amount;
                  });
                  return Object.entries(paymentBreakdown).map(([method, amount]) => (
                    <div key={method} className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400 capitalize">{method}:</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{safeFormatCurrency(amount)}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Same Period Created and Paid */}
      {samePeriodCreatedAndPaid.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border-2 border-green-200 dark:border-green-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Same Period Created and Paid
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Sales created and paid within the selected date range
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle className="text-green-600 dark:text-green-400" size={24} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {samePeriodCreatedAndPaid.length}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Transactions</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                {safeFormatCurrency(
                  samePeriodCreatedAndPaid.reduce((sum, sale) =>
                    sum + sale.items.reduce((a, i) => a + (Number(i.price) || 0) * (i.qty || 1), 0), 0
                  )
                )}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Amount</p>
            </div>
            <div className="text-center">
              <div className="space-y-1">
                {(() => {
                  const paymentBreakdown = {};
                  samePeriodCreatedAndPaid.forEach(sale => {
                    const method = sale.paid_using || 'Unknown';
                    const amount = sale.items.reduce((sum, item) => sum + (Number(item.price) || 0) * (item.qty || 1), 0);
                    paymentBreakdown[method] = (paymentBreakdown[method] || 0) + amount;
                  });
                  return Object.entries(paymentBreakdown).map(([method, amount]) => (
                    <div key={method} className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400 capitalize">{method}:</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{safeFormatCurrency(amount)}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts: Revenue Trend and Sales Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueTrendChart chartData={analytics.chartData} timePeriod={timePeriod} formatCurrency={formatCurrency} />
        <SalesVolumeChart chartData={analytics.chartData} timePeriod={timePeriod} />
      </div>

      {/* Payment Breakdown Chart */}
      <PaymentBreakdownChart paymentMethodBreakdown={analytics.paymentMethodBreakdown} formatCurrency={formatCurrency} />

      {/* Individual Items Distribution */}
      <ItemSalesChart inventoryUsed={analytics.inventoryUsed} formatCurrency={formatCurrency} />

      {/* Services vs Items vs Freebies */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Services vs Items vs Freebies
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64">
            <h4 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-2 text-center">
              Count Distribution
            </h4>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Services', value: analytics.serviceCount, color: '#F59E0B' },
                    { name: 'Items', value: analytics.itemCount, color: '#06B6D4' },
                    { name: 'Freebies', value: analytics.freebieCount, color: '#EC4899' },
                  ].filter(item => item.value > 0)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={70}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {[
                    { name: 'Services', value: analytics.serviceCount, color: '#F59E0B' },
                    { name: 'Items', value: analytics.itemCount, color: '#06B6D4' },
                    { name: 'Freebies', value: analytics.freebieCount, color: '#EC4899' },
                  ].filter(item => item.value > 0).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [`${value} units`, name]}
                  contentStyle={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="h-64">
            <h4 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-2 text-center">
              Revenue Distribution
            </h4>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Services', value: analytics.serviceRevenue, color: '#F59E0B' },
                    { name: 'Items', value: analytics.itemRevenue, color: '#06B6D4' },
                  ].filter(item => item.value > 0)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={70}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {[
                    { name: 'Services', value: analytics.serviceRevenue, color: '#F59E0B' },
                    { name: 'Items', value: analytics.itemRevenue, color: '#06B6D4' },
                  ].filter(item => item.value > 0).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [safeFormatCurrency(value), name]}
                  contentStyle={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Items and Services Count */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Services</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{analytics.serviceCount}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Services</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-500 dark:text-orange-300">{analytics.uniqueServices}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Unique Types</p>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <p className="text-lg font-bold text-orange-700 dark:text-orange-300">{safeFormatCurrency(analytics.serviceRevenue)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500">Revenue</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Items</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">{analytics.itemCount}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Items</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-teal-500 dark:text-teal-300">{analytics.uniqueItems}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Unique Types</p>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <p className="text-lg font-bold text-teal-700 dark:text-teal-300">{safeFormatCurrency(analytics.itemRevenue)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500">Revenue</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Freebies</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">{analytics.freebieCount}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Freebies</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-pink-500 dark:text-pink-300">{analytics.uniqueFreebies}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Unique Types</p>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <p className="text-lg font-bold text-pink-700 dark:text-pink-300">FREE</p>
            <p className="text-xs text-gray-500 dark:text-gray-500">No Cost</p>
          </div>
        </div>
      </div>

      {/* Services Breakdown */}
      {analytics.serviceBreakdown.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Services Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-600">
                  <th className="text-left py-2 text-gray-900 dark:text-gray-100">Service Name</th>
                  <th className="text-center py-2 text-gray-900 dark:text-gray-100">Qty</th>
                  <th className="text-right py-2 text-gray-900 dark:text-gray-100">Price</th>
                  <th className="text-right py-2 text-gray-900 dark:text-gray-100">Total</th>
                </tr>
              </thead>
              <tbody>
                {analytics.serviceBreakdown.map(service => (
                  <tr key={service.name} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2 text-gray-900 dark:text-gray-100 font-medium">{service.name}</td>
                    <td className="py-2 text-center text-gray-700 dark:text-gray-300">{service.qty}</td>
                    <td className="py-2 text-right text-gray-700 dark:text-gray-300">{safeFormatCurrency(service.price)}</td>
                    <td className="py-2 text-right text-gray-900 dark:text-gray-100 font-semibold">{safeFormatCurrency(service.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 dark:border-gray-500">
                  <td className="py-2 text-gray-900 dark:text-gray-100 font-bold">Total</td>
                  <td className="py-2 text-center text-gray-900 dark:text-gray-100 font-bold">
                    {analytics.serviceBreakdown.reduce((sum, service) => sum + service.qty, 0)}
                  </td>
                  <td className="py-2"></td>
                  <td className="py-2 text-right text-gray-900 dark:text-gray-100 font-bold">
                    {safeFormatCurrency(analytics.serviceBreakdown.reduce((sum, service) => sum + service.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Item Categories Used */}
      {analytics.itemGroups.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Item Categories Used</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {analytics.itemGroups.map(group => (
              <div key={group.category} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">[{group.category}]</h4>
                  <Package size={24} className="text-gray-600 dark:text-gray-400" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Units Used:</span>
                    <span className="font-bold text-gray-900 dark:text-gray-100">{group.count}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Unique Items:</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{group.uniqueItems}</span>
                  </div>
                  {group.revenue > 0 && (
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Revenue:</span>
                        <span className="font-bold text-green-600 dark:text-green-400">{safeFormatCurrency(group.revenue)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
