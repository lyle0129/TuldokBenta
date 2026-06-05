import { useMemo } from "react";
import { 
  FileText, 
  CheckCircle, 
  Wallet, 
  Diamond, 
  Banknote,
  Wrench,
  Package,
  Gift,
  CreditCard,
  Smartphone,
  BarChart3,
  Activity
} from 'lucide-react';

export default function TodaysSummary({ 
  openSales, 
  closedSales, 
  formatCurrency 
}) {
  // Safe format currency function
  const safeFormatCurrency = (value) => {
    const numValue = Number(value) || 0;
    return formatCurrency(numValue);
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Filter sales for today
  const todaysOpenSales = useMemo(() => {
    return openSales.filter(sale => {
      const saleDate = new Date(sale.created_at);
      return saleDate >= today && saleDate < tomorrow;
    });
  }, [openSales, today, tomorrow]);

  const todaysClosedSales = useMemo(() => {
    return closedSales.filter(sale => {
      const saleDate = new Date(sale.created_at);
      return saleDate >= today && saleDate < tomorrow;
    });
  }, [closedSales, today, tomorrow]);

  // Closed sales today from previous days (paid today but created before today)
  const closedSalesTodayFromPrevious = useMemo(() => {
    return closedSales.filter(sale => {
      if (!sale.paid_at) return false;
      
      const createdDate = new Date(sale.created_at);
      const paidDate = new Date(sale.paid_at);
      
      // Created before today but paid today
      return createdDate < today && paidDate >= today && paidDate < tomorrow;
    });
  }, [closedSales, today, tomorrow]);

  // Calculate totals
  const todaysOpenTotal = useMemo(() => {
    return todaysOpenSales.reduce((sum, sale) => 
      sum + sale.items.reduce((itemSum, item) => itemSum + (item.price * (item.qty || 1)), 0), 0
    );
  }, [todaysOpenSales]);

  const todaysClosedTotal = useMemo(() => {
    return todaysClosedSales.reduce((sum, sale) => 
      sum + sale.items.reduce((itemSum, item) => itemSum + (item.price * (item.qty || 1)), 0), 0
    );
  }, [todaysClosedSales]);

  const previousDaysClosedTotal = useMemo(() => {
    return closedSalesTodayFromPrevious.reduce((sum, sale) => 
      sum + sale.items.reduce((itemSum, item) => itemSum + (item.price * (item.qty || 1)), 0), 0
    );
  }, [closedSalesTodayFromPrevious]);

  // Payment method breakdown for today's paid sales (closed today + previous days paid today)
  const paymentMethodBreakdown = useMemo(() => {
    const allPaidToday = [...todaysClosedSales, ...closedSalesTodayFromPrevious];
    const breakdown = {};
    
    allPaidToday.forEach(sale => {
      const paymentMethod = sale.paid_using || 'Unknown';
      const saleTotal = sale.items.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0);
      
      if (!breakdown[paymentMethod]) {
        breakdown[paymentMethod] = { count: 0, total: 0 };
      }
      breakdown[paymentMethod].count += 1;
      breakdown[paymentMethod].total += saleTotal;
    });
    
    return breakdown;
  }, [todaysClosedSales, closedSalesTodayFromPrevious]);

  // Count items and services for today
  const todaysItemsAndServices = useMemo(() => {
    const allTodaysSales = [...todaysOpenSales, ...todaysClosedSales, ...closedSalesTodayFromPrevious];
    const todaysCreatedSales = [...todaysOpenSales, ...todaysClosedSales]; // Only sales created today
    
    let itemCount = 0;
    let serviceCount = 0;
    let freebieCount = 0;
    let itemRevenue = 0;
    let serviceRevenue = 0;
    
    const serviceTypes = new Set();
    const itemTypes = new Set();
    const freebieTypes = new Set();
    const inventoryUsed = {}; // For merging items and freebies
    const serviceBreakdown = {}; // For service breakdown
    const itemGroups = {}; // For grouping items by category

    // Use allTodaysSales for overall counts (including previous days paid today)
    allTodaysSales.forEach(sale => {
      sale.items.forEach(item => {
        const qty = item.qty || 1;
        const price = Number(item.price) || 0;
        const revenue = price * qty;
        
        if (item.type === 'service') {
          serviceCount += qty;
          serviceRevenue += revenue;
          serviceTypes.add(item.service_name);
        } else if (item.type === 'item') {
          if (price > 0) {
            // Paid item
            itemCount += qty;
            itemRevenue += revenue;
            itemTypes.add(item.item_name);
          } else {
            // Freebie (price = 0)
            freebieCount += qty;
            freebieTypes.add(item.item_name);
          }
        }
      });
    });

    // Use todaysCreatedSales for service breakdown and inventory (only sales created today)
    todaysCreatedSales.forEach(sale => {
      sale.items.forEach(item => {
        const qty = item.qty || 1;
        const price = Number(item.price) || 0;
        const revenue = price * qty;
        
        if (item.type === 'service') {
          // Service breakdown
          const serviceName = item.service_name;
          if (!serviceBreakdown[serviceName]) {
            serviceBreakdown[serviceName] = { qty: 0, price: Number(item.price) || 0, total: 0 };
          }
          serviceBreakdown[serviceName].qty += qty;
          serviceBreakdown[serviceName].total += revenue;
          
        } else if (item.type === 'item') {
          // Group items by category (text before first space)
          const itemName = item.item_name;
          const spaceIndex = itemName.indexOf(' ');
          const category = spaceIndex > 0 ? itemName.substring(0, spaceIndex) : itemName;
          
          if (!itemGroups[category]) {
            itemGroups[category] = { count: 0, revenue: 0, items: new Set() };
          }
          itemGroups[category].count += qty;
          itemGroups[category].revenue += revenue;
          itemGroups[category].items.add(itemName);
          
          // Add to inventory used (merge items and freebies)
          if (!inventoryUsed[itemName]) {
            inventoryUsed[itemName] = { count: 0, revenue: 0, isFreebie: price === 0 };
          }
          inventoryUsed[itemName].count += qty;
          inventoryUsed[itemName].revenue += revenue;
        }
      });
    });

    return {
      itemCount,
      serviceCount,
      freebieCount,
      itemRevenue,
      serviceRevenue,
      uniqueServices: serviceTypes.size,
      uniqueItems: itemTypes.size,
      uniqueFreebies: freebieTypes.size,
      serviceBreakdown: Object.entries(serviceBreakdown)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.total - a.total),
      itemGroups: Object.entries(itemGroups)
        .map(([category, data]) => ({ 
          category, 
          count: data.count, 
          revenue: data.revenue,
          uniqueItems: data.items.size 
        }))
        .sort((a, b) => b.count - a.count),
      inventoryUsed: Object.entries(inventoryUsed)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count)
    };
  }, [todaysOpenSales, todaysClosedSales, closedSalesTodayFromPrevious]);

  const todaysGrandTotal = todaysOpenTotal + todaysClosedTotal;
  const todaysPaidTotal = todaysClosedTotal + previousDaysClosedTotal;

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Today's Summary
        </h2>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {today.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {/* Today's Open Sales */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Open Sales Today</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {todaysOpenSales.length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                {safeFormatCurrency(todaysOpenTotal)}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <FileText className="text-blue-600 dark:text-blue-400" size={24} />
            </div>
          </div>
        </div>

        {/* Today's Closed Sales */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Closed Sales Today</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {todaysClosedSales.length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                {safeFormatCurrency(todaysClosedTotal)}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle className="text-green-600 dark:text-green-400" size={24} />
            </div>
          </div>
        </div>

        {/* Previous Days Closed Today */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Previous Days Paid Today</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {closedSalesTodayFromPrevious.length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                {safeFormatCurrency(previousDaysClosedTotal)}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
              <Wallet className="text-purple-600 dark:text-purple-400" size={24} />
            </div>
          </div>
        </div>

        {/* Today's Total (Open + Closed Today) */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border-2 border-indigo-200 dark:border-indigo-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Today's Total</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {safeFormatCurrency(todaysGrandTotal)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                {todaysOpenSales.length + todaysClosedSales.length} transactions
              </p>
            </div>
            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
              <Diamond className="text-indigo-600 dark:text-indigo-400" size={24} />
            </div>
          </div>
        </div>

        {/* Today's Paid Total */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border-2 border-emerald-200 dark:border-emerald-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Today's Paid</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {safeFormatCurrency(todaysPaidTotal)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                {todaysClosedSales.length + closedSalesTodayFromPrevious.length} payments
              </p>
            </div>
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
              <Banknote className="text-emerald-600 dark:text-emerald-400" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Payment Method Breakdown */}
      {Object.keys(paymentMethodBreakdown).length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Today's Payment Methods
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
      )}

      {/* Items and Services Count */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Services */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Services Today
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {todaysItemsAndServices.serviceCount}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Services</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-500 dark:text-orange-300">
                {todaysItemsAndServices.uniqueServices}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Unique Types</p>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <p className="text-lg font-bold text-orange-700 dark:text-orange-300">
              {safeFormatCurrency(todaysItemsAndServices.serviceRevenue)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">Revenue</p>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Items Today
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                {todaysItemsAndServices.itemCount}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Items</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-teal-500 dark:text-teal-300">
                {todaysItemsAndServices.uniqueItems}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Unique Types</p>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <p className="text-lg font-bold text-teal-700 dark:text-teal-300">
              {safeFormatCurrency(todaysItemsAndServices.itemRevenue)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">Revenue</p>
          </div>
        </div>

        {/* Freebies */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Freebies Today
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">
                {todaysItemsAndServices.freebieCount}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Freebies</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-pink-500 dark:text-pink-300">
                {todaysItemsAndServices.uniqueFreebies}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Unique Types</p>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <p className="text-lg font-bold text-pink-700 dark:text-pink-300">
              FREE
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">No Cost</p>
          </div>
        </div>
      </div>

      {/* Services Breakdown */}
      {todaysItemsAndServices.serviceBreakdown.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Services Breakdown Today (Created Today Only)
          </h3>
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
                {todaysItemsAndServices.serviceBreakdown.map(service => (
                  <tr key={service.name} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2 text-gray-900 dark:text-gray-100 font-medium">
                      {service.name}
                    </td>
                    <td className="py-2 text-center text-gray-700 dark:text-gray-300">
                      {service.qty}
                    </td>
                    <td className="py-2 text-right text-gray-700 dark:text-gray-300">
                      {safeFormatCurrency(service.price)}
                    </td>
                    <td className="py-2 text-right text-gray-900 dark:text-gray-100 font-semibold">
                      {safeFormatCurrency(service.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 dark:border-gray-500">
                  <td className="py-2 text-gray-900 dark:text-gray-100 font-bold">Total</td>
                  <td className="py-2 text-center text-gray-900 dark:text-gray-100 font-bold">
                    {todaysItemsAndServices.serviceBreakdown.reduce((sum, service) => sum + service.qty, 0)}
                  </td>
                  <td className="py-2"></td>
                  <td className="py-2 text-right text-gray-900 dark:text-gray-100 font-bold">
                    {safeFormatCurrency(todaysItemsAndServices.serviceBreakdown.reduce((sum, service) => sum + service.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Item Groups */}
      {todaysItemsAndServices.itemGroups.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Item Categories Used Today (Created Today Only)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {todaysItemsAndServices.itemGroups.map(group => (
              <div key={group.category} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                    [{group.category}]
                  </h4>
                  <Package size={24} className="text-gray-600 dark:text-gray-400" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Units Used:</span>
                    <span className="font-bold text-gray-900 dark:text-gray-100">
                      {group.count}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Unique Items:</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {group.uniqueItems}
                    </span>
                  </div>
                  {group.revenue > 0 && (
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Revenue:</span>
                        <span className="font-bold text-green-600 dark:text-green-400">
                          {safeFormatCurrency(group.revenue)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {todaysItemsAndServices.itemGroups.reduce((sum, group) => sum + group.count, 0)}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Units</p>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {todaysItemsAndServices.itemGroups.length}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Categories</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">
                  {safeFormatCurrency(todaysItemsAndServices.itemGroups.reduce((sum, group) => sum + group.revenue, 0))}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Revenue</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Used Today */}
      {todaysItemsAndServices.inventoryUsed.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Inventory Used Today (Created Today Only)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {todaysItemsAndServices.inventoryUsed.map(item => (
              <div key={item.name} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {item.name}
                  </h4>
                  <span className="text-lg">
                    {item.revenue > 0 ? <Wallet size={20} className="text-green-600 dark:text-green-400" /> : <Gift size={20} className="text-pink-600 dark:text-pink-400" />}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {item.count} units
                  </div>
                  {item.revenue > 0 && (
                    <div className="text-sm text-green-600 dark:text-green-400">
                      {safeFormatCurrency(item.revenue)}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 dark:text-gray-500">
                    {item.revenue > 0 ? 'Paid Item' : 'Freebie'}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {todaysItemsAndServices.inventoryUsed.reduce((sum, item) => sum + item.count, 0)}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Units</p>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {todaysItemsAndServices.inventoryUsed.length}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Unique Items</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">
                  {safeFormatCurrency(todaysItemsAndServices.inventoryUsed.reduce((sum, item) => sum + item.revenue, 0))}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Value</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      {(todaysOpenSales.length > 0 || todaysClosedSales.length > 0 || closedSalesTodayFromPrevious.length > 0) && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
          <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <BarChart3 size={16} />
              Open: {todaysOpenSales.length} sales
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle size={16} />
              Closed: {todaysClosedSales.length} sales
            </span>
            <span className="flex items-center gap-1">
              <Wallet size={16} />
              Previous Paid: {closedSalesTodayFromPrevious.length} sales
            </span>
            <span className="flex items-center gap-1">
              <Wrench size={16} />
              Services: {todaysItemsAndServices.serviceCount} units
            </span>
            <span className="flex items-center gap-1">
              <Package size={16} />
              Items: {todaysItemsAndServices.itemCount} units
            </span>
            <span className="flex items-center gap-1">
              <Gift size={16} />
              Freebies: {todaysItemsAndServices.freebieCount} units
            </span>
            <span className="flex items-center gap-1">
              <Banknote size={16} />
              Total Paid: {safeFormatCurrency(todaysPaidTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}