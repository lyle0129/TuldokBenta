import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Eye, EyeOff, RotateCcw, BarChart3 } from 'lucide-react';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

const ItemSalesChart = ({ inventoryUsed, formatCurrency }) => {
  if (!inventoryUsed || inventoryUsed.length === 0) {
    return null;
  }

  const safeFormatCurrency = (value) => formatCurrency(Number(value) || 0);

  const [visibleItems, setVisibleItems] = useState(
    () => new Set(inventoryUsed.slice(0, 8).map(item => item.name))
  );

  useEffect(() => {
    setVisibleItems(new Set(inventoryUsed.slice(0, 8).map(item => item.name)));
  }, [inventoryUsed]);

  const toggleItemVisibility = (itemName) => {
    setVisibleItems(prev => {
      const next = new Set(prev);
      if (next.has(itemName)) {
        next.delete(itemName);
      } else {
        next.add(itemName);
      }
      return next;
    });
  };

  const visibleInventoryData = inventoryUsed.filter(item => visibleItems.has(item.name));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Individual Items Distribution
      </h3>

      {/* Item Toggle Controls */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-gray-900 dark:text-gray-100">
            Toggle Items ({visibleItems.size} of {inventoryUsed.length} shown)
          </h4>
          <div className="flex gap-2">
            <button
              onClick={() => setVisibleItems(new Set(inventoryUsed.map(item => item.name)))}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              <Eye size={12} />
              Show All
            </button>
            <button
              onClick={() => setVisibleItems(new Set())}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              <EyeOff size={12} />
              Hide All
            </button>
            <button
              onClick={() => setVisibleItems(new Set(inventoryUsed.slice(0, 8).map(item => item.name)))}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              <RotateCcw size={12} />
              Top 8
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
          {inventoryUsed.map((item, index) => (
            <button
              key={item.name}
              onClick={() => toggleItemVisibility(item.name)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                visibleItems.has(item.name)
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-700'
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-500'
              }`}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: visibleItems.has(item.name) ? COLORS[index % COLORS.length] : '#9CA3AF' }}
              ></div>
              <span className="max-w-24 truncate">{item.name}</span>
              <span className="text-xs opacity-75">({item.count})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64">
          {visibleInventoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={visibleInventoryData.map((item) => ({
                    name: item.name,
                    value: item.count,
                    revenue: item.revenue,
                    type: item.type,
                    color: COLORS[inventoryUsed.findIndex(i => i.name === item.name) % COLORS.length]
                  }))}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name.length > 15 ? name.substring(0, 12) + '...' : name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {visibleInventoryData.map((item) => (
                    <Cell
                      key={`cell-${item.name}`}
                      fill={COLORS[inventoryUsed.findIndex(i => i.name === item.name) % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name, props) => [
                    `${value} units`,
                    `${name} (${props.payload.type}${props.payload.revenue > 0 ? `, ${safeFormatCurrency(props.payload.revenue)}` : ', Free'})`
                  ]}
                  contentStyle={{
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-700 rounded">
              <div className="text-center">
                <BarChart3 size={48} className="mx-auto mb-2 text-gray-400" />
                <p className="text-gray-600 dark:text-gray-400">No items selected</p>
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  Toggle items above to display
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
            Item Details ({inventoryUsed.length} total)
          </h4>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {inventoryUsed.map((item, index) => (
              <div
                key={item.name}
                className={`flex items-center justify-between p-2 rounded transition-opacity ${
                  visibleItems.has(item.name)
                    ? 'bg-gray-50 dark:bg-gray-700 opacity-100'
                    : 'bg-gray-100 dark:bg-gray-600 opacity-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleItemVisibility(item.name)}
                    className="w-3 h-3 rounded-full border-2 border-gray-300 dark:border-gray-500 hover:border-blue-500 transition-colors"
                    style={{
                      backgroundColor: visibleItems.has(item.name) ? COLORS[index % COLORS.length] : 'transparent'
                    }}
                  ></button>
                  <div className="flex-1">
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                      {item.name}
                    </span>
                    <div className="flex gap-2 mt-1">
                      {item.isPaidItem && (
                        <span className="px-1 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs">
                          Paid
                        </span>
                      )}
                      {item.isFreebie && (
                        <span className="px-1 py-0.5 bg-pink-100 dark:bg-pink-900 text-pink-800 dark:text-pink-200 rounded text-xs">
                          Freebie
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-bold text-gray-900 dark:text-gray-100">
                    {item.count} units
                  </div>
                  {item.revenue > 0 && (
                    <div className="text-green-600 dark:text-green-400 font-medium">
                      {safeFormatCurrency(item.revenue)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="pt-3 border-t border-gray-200 dark:border-gray-600">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {visibleInventoryData.reduce((sum, item) => sum + item.count, 0)}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Visible Units</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">
                  {safeFormatCurrency(visibleInventoryData.reduce((sum, item) => sum + item.revenue, 0))}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Visible Revenue</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemSalesChart;
