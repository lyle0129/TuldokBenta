import { useMemo, useState, useEffect } from "react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { 
  Calendar, 
  BarChart3, 
  TrendingUp, 
  PieChart as PieChartIcon,
  FileText, 
  CheckCircle, 
  Diamond, 
  Activity,
  Wrench,
  Package,
  Gift,
  CreditCard,
  Smartphone,
  Banknote,
  Wallet,
  Eye,
  EyeOff,
  RotateCcw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export default function OverviewSummary({ 
  openSales, 
  closedSales, 
  formatCurrency,
  filters = null, // Add filters prop
  allOpenSales = null, // Add original unfiltered data
  allClosedSales = null // Add original unfiltered data
}) {
  const [timePeriod, setTimePeriod] = useState('daily'); // 'yearly', 'monthly', 'weekly', 'daily'
  const [visibleItems, setVisibleItems] = useState(new Set()); // Track which items are visible in chart

  // Safe format currency function
  const safeFormatCurrency = (value) => {
    const numValue = Number(value) || 0;
    return formatCurrency(numValue);
  };

  // Apply date filters to sales data considering both created_at and paid_at
  const applyDateFilters = (sales) => {
    if (!filters || (!filters.dateRange.from && !filters.dateRange.to)) {
      return sales;
    }

    const startDate = filters.dateRange.from ? new Date(filters.dateRange.from) : null;
    const endDate = filters.dateRange.to ? new Date(filters.dateRange.to) : null;
    
    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);

    return sales.filter(sale => {
      const createdDate = new Date(sale.created_at);
      const paidDate = sale.paid_at ? new Date(sale.paid_at) : null;

      // PRIORITY 1: Include ALL sales that were paid within the date range (regardless of creation date)
      if (paidDate) {
        const paidInRange = (!startDate || paidDate >= startDate) && (!endDate || paidDate <= endDate);
        if (paidInRange) {
          return true; // Always include if payment was made in range
        }
      }

      // PRIORITY 2: Include unpaid sales created within the range
      const createdInRange = (!startDate || createdDate >= startDate) && (!endDate || createdDate <= endDate);
      if (!paidDate && createdInRange) {
        return true; // Include unpaid sales from the period
      }

      // PRIORITY 3: Include paid sales created in range (even if paid outside range)
      if (paidDate && createdInRange) {
        return true; // Include sales created in period regardless of payment date
      }

      return false;
    });
  };

  // Time period options
  const timePeriodOptions = [
    { id: 'daily', label: 'Daily', icon: Calendar },
    { id: 'weekly', label: 'Weekly', icon: BarChart3 },
    { id: 'monthly', label: 'Monthly', icon: TrendingUp },
    { id: 'yearly', label: 'Yearly', icon: FileText }
  ];

  // Format period labels for display
  const formatPeriodLabel = (period, timePeriod) => {
    switch (timePeriod) {
      case 'yearly':
        return period;
      case 'monthly':
        const [year, month] = period.split('-');
        return new Date(year, month - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      case 'weekly':
        return new Date(period).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case 'daily':
      default:
        return new Date(period).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  // Group sales data by time period with improved daily tracking
  const groupSalesByPeriod = (sales, period) => {
    const grouped = {};
    
    // Helper function to get period key from date
    const getPeriodKey = (date, period) => {
      switch (period) {
        case 'yearly':
          return date.getFullYear().toString();
        case 'monthly':
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        case 'weekly':
          const startOfWeek = new Date(date);
          startOfWeek.setDate(date.getDate() - date.getDay());
          return startOfWeek.toISOString().split('T')[0];
        case 'daily':
        default:
          return date.toISOString().split('T')[0];
      }
    };
    
    // Process all sales
    sales.forEach(sale => {
      const createdDate = new Date(sale.created_at);
      const createdKey = getPeriodKey(createdDate, period);
      const saleTotal = sale.items.reduce((sum, item) => sum + (Number(item.price) || 0) * (item.qty || 1), 0);
      
      // Initialize creation period if not exists
      if (!grouped[createdKey]) {
        grouped[createdKey] = { 
          open: [], 
          closed: [], 
          total: 0, 
          revenue: 0,
          paymentsToday: [],
          cashPayments: 0,
          gcashPayments: 0,
          otherPayments: 0
        };
      }
      
      if (sale.paid_at) {
        const paidDate = new Date(sale.paid_at);
        const paidKey = getPeriodKey(paidDate, period);
        
        // Initialize payment period if not exists
        if (!grouped[paidKey]) {
          grouped[paidKey] = { 
            open: [], 
            closed: [], 
            total: 0, 
            revenue: 0,
            paymentsToday: [],
            cashPayments: 0,
            gcashPayments: 0,
            otherPayments: 0
          };
        }
        
        // ALWAYS add payment info to the day it was actually paid
        grouped[paidKey].paymentsToday.push(sale);
        grouped[paidKey].revenue += saleTotal;
        
        // Track payment methods for the day it was paid
        const paymentMethod = (sale.paid_using || '').toLowerCase();
        if (paymentMethod === 'cash') {
          grouped[paidKey].cashPayments += saleTotal;
        } else if (paymentMethod === 'gcash') {
          grouped[paidKey].gcashPayments += saleTotal;
        } else {
          grouped[paidKey].otherPayments += saleTotal;
        }
        
        // Handle closed/open classification based on creation vs payment date
        if (createdKey === paidKey) {
          // Same day: add to closed for creation day
          grouped[createdKey].closed.push(sale);
          grouped[createdKey].total += 1;
        } else {
          // Different days: 
          // - Add to open for creation day (wasn't paid same day)
          grouped[createdKey].open.push(sale);
          grouped[createdKey].total += 1;
          
          // - Add to closed for payment day (but don't double count in total)
          grouped[paidKey].closed.push(sale);
          // Don't increment total for payment day if it's a different day than creation
        }
        
      } else {
        // Unpaid sale - add to open for creation day
        grouped[createdKey].open.push(sale);
        grouped[createdKey].total += 1;
      }
    });
    
    return grouped;
  };

  // Apply date filters to sales data
  const dateFilteredOpenSales = useMemo(() => applyDateFilters(allOpenSales || openSales), [allOpenSales, openSales, filters]);
  const dateFilteredClosedSales = useMemo(() => applyDateFilters(allClosedSales || closedSales), [allClosedSales, closedSales, filters]);

  // Calculate "Previous Days Paid in Range" - sales created outside filter range but paid within range
  const previousDaysPaidInRange = useMemo(() => {
    if (!filters || (!filters.dateRange.from && !filters.dateRange.to)) {
      return [];
    }

    const startDate = filters.dateRange.from ? new Date(filters.dateRange.from) : null;
    const endDate = filters.dateRange.to ? new Date(filters.dateRange.to) : null;
    
    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);

    // Use original unfiltered data to find all payments made in range
    const allSales = [...(allClosedSales || closedSales)];
    
    return allSales.filter(sale => {
      if (!sale.paid_at) return false;
      
      const createdDate = new Date(sale.created_at);
      const paidDate = new Date(sale.paid_at);
      
      // Check if paid within range
      const paidInRange = (!startDate || paidDate >= startDate) && (!endDate || paidDate <= endDate);
      
      // Check if created outside range
      const createdOutsideRange = (startDate && createdDate < startDate) || (endDate && createdDate > endDate);
      
      return paidInRange && createdOutsideRange;
    });
  }, [allClosedSales, closedSales, filters]);

  // Calculate "Same Period Created and Paid" - sales created and paid within the selected range
  const samePeriodCreatedAndPaid = useMemo(() => {
    if (!filters || (!filters.dateRange.from && !filters.dateRange.to)) {
      return [];
    }

    const startDate = filters.dateRange.from ? new Date(filters.dateRange.from) : null;
    const endDate = filters.dateRange.to ? new Date(filters.dateRange.to) : null;
    
    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);

    // Use original unfiltered data to find all sales created and paid in range
    const allSales = [...(allClosedSales || closedSales)];
    
    return allSales.filter(sale => {
      if (!sale.paid_at) return false;
      
      const createdDate = new Date(sale.created_at);
      const paidDate = new Date(sale.paid_at);
      
      // Check if both created and paid within range
      const createdInRange = (!startDate || createdDate >= startDate) && (!endDate || createdDate <= endDate);
      const paidInRange = (!startDate || paidDate >= startDate) && (!endDate || paidDate <= endDate);
      
      return createdInRange && paidInRange;
    });
  }, [allClosedSales, closedSales, filters]);

  // Calculate comprehensive analytics
  const analytics = useMemo(() => {
    const allSales = [...dateFilteredOpenSales, ...dateFilteredClosedSales];
    
    let itemCount = 0;
    let serviceCount = 0;
    let freebieCount = 0;
    let itemRevenue = 0;
    let serviceRevenue = 0;
    
    const serviceTypes = new Set();
    const itemTypes = new Set();
    const freebieTypes = new Set();
    const serviceBreakdown = {};
    const itemGroups = {};
    const paymentMethodBreakdown = {};
    const inventoryUsed = {}; // For individual item tracking

    // Group data by time period for charts
    const groupedData = groupSalesByPeriod(allSales, timePeriod);
    const chartData = Object.entries(groupedData)
      .map(([period, data]) => ({
        period,
        openSales: data.open.length,
        closedSales: data.closed.length,
        totalSales: data.total,
        revenue: data.revenue,
        paymentsToday: data.paymentsToday.length,
        cashPayments: data.cashPayments,
        gcashPayments: data.gcashPayments,
        otherPayments: data.otherPayments,
        displayPeriod: formatPeriodLabel(period, timePeriod)
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    allSales.forEach(sale => {
      // Payment method tracking (only for closed sales, based on paid_at date)
      if (sale.paid_at && sale.paid_using) {
        const paymentMethod = sale.paid_using;
        const saleTotal = sale.items.reduce((sum, item) => sum + (Number(item.price) || 0) * (item.qty || 1), 0);
        
        if (!paymentMethodBreakdown[paymentMethod]) {
          paymentMethodBreakdown[paymentMethod] = { count: 0, total: 0 };
        }
        paymentMethodBreakdown[paymentMethod].count += 1;
        paymentMethodBreakdown[paymentMethod].total += saleTotal;
      }

      sale.items.forEach(item => {
        const qty = item.qty || 1;
        const price = Number(item.price) || 0;
        const revenue = price * qty;
        
        if (item.type === 'service') {
          serviceCount += qty;
          serviceRevenue += revenue;
          serviceTypes.add(item.service_name);
          
          // Service breakdown
          const serviceName = item.service_name;
          if (!serviceBreakdown[serviceName]) {
            serviceBreakdown[serviceName] = { qty: 0, price: price, total: 0 };
          }
          serviceBreakdown[serviceName].qty += qty;
          serviceBreakdown[serviceName].total += revenue;
          
        } else if (item.type === 'item') {
          if (price > 0) {
            itemCount += qty;
            itemRevenue += revenue;
            itemTypes.add(item.item_name);
          } else {
            freebieCount += qty;
            freebieTypes.add(item.item_name);
          }
          
          // Group items by category
          const itemName = item.item_name;
          const spaceIndex = itemName.indexOf(' ');
          const category = spaceIndex > 0 ? itemName.substring(0, spaceIndex) : itemName;
          
          if (!itemGroups[category]) {
            itemGroups[category] = { count: 0, revenue: 0, items: new Set() };
          }
          itemGroups[category].count += qty;
          itemGroups[category].revenue += revenue;
          itemGroups[category].items.add(itemName);

          // Individual inventory tracking (for the inventory chart)
          if (!inventoryUsed[itemName]) {
            inventoryUsed[itemName] = { count: 0, revenue: 0, isPaidItem: false, isFreebie: false };
          }
          inventoryUsed[itemName].count += qty;
          inventoryUsed[itemName].revenue += revenue;
          if (price > 0) {
            inventoryUsed[itemName].isPaidItem = true;
          } else {
            inventoryUsed[itemName].isFreebie = true;
          }
        }
      });
    });

    const openTotal = dateFilteredOpenSales.reduce((sum, sale) => 
      sum + sale.items.reduce((a, i) => a + (Number(i.price) || 0) * (i.qty || 1), 0), 0
    );

    const closedTotal = dateFilteredClosedSales.reduce((sum, sale) => 
      sum + sale.items.reduce((a, i) => a + (Number(i.price) || 0) * (i.qty || 1), 0), 0
    );

    return {
      openTotal,
      closedTotal,
      grandTotal: openTotal + closedTotal,
      itemCount,
      serviceCount,
      freebieCount,
      itemRevenue,
      serviceRevenue,
      uniqueServices: serviceTypes.size,
      uniqueItems: itemTypes.size,
      uniqueFreebies: freebieTypes.size,
      chartData,
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
        .map(([name, data]) => ({ 
          name, 
          count: data.count, 
          revenue: data.revenue,
          isPaidItem: data.isPaidItem,
          isFreebie: data.isFreebie,
          type: data.isPaidItem && data.isFreebie ? 'Both' : data.isPaidItem ? 'Paid' : 'Freebie'
        }))
        .sort((a, b) => b.count - a.count),
      paymentMethodBreakdown
    };
  }, [dateFilteredOpenSales, dateFilteredClosedSales, timePeriod]);

  // Initialize visible items when inventory data changes
  useEffect(() => {
    if (analytics.inventoryUsed.length > 0) {
      // Initially show top 8 items
      const topItems = analytics.inventoryUsed.slice(0, 8).map(item => item.name);
      setVisibleItems(new Set(topItems));
    }
  }, [analytics.inventoryUsed]);

  // Toggle item visibility
  const toggleItemVisibility = (itemName) => {
    const newVisibleItems = new Set(visibleItems);
    if (newVisibleItems.has(itemName)) {
      newVisibleItems.delete(itemName);
    } else {
      newVisibleItems.add(itemName);
    }
    setVisibleItems(newVisibleItems);
  };

  // Get filtered data for chart (only visible items)
  const visibleInventoryData = analytics.inventoryUsed.filter(item => 
    visibleItems.has(item.name)
  );

  // Chart colors
  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

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
        {/* Open Sales */}
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

        {/* Closed Sales */}
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

        {/* Total Sales */}
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

        {/* Average Sale */}
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
              <p className="text-sm text-gray-500 dark:text-gray-500">
                Per transaction
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
              <Activity className="text-purple-600 dark:text-purple-400" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Previous Days Paid in Range Card */}
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
                {/* Payment method breakdown for previous days paid */}
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
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {safeFormatCurrency(amount)}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Same Period Created and Paid Card */}
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
                {/* Payment method breakdown for same period created and paid */}
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
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {safeFormatCurrency(amount)}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Revenue Trend ({timePeriod})
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="displayPeriod" 
                  tick={{ fontSize: 12 }}
                  className="text-gray-600 dark:text-gray-400"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  className="text-gray-600 dark:text-gray-400"
                />
                <Tooltip 
                  formatter={(value) => [safeFormatCurrency(value), 'Revenue']}
                  labelStyle={{ color: '#374151' }}
                  contentStyle={{ 
                    backgroundColor: '#f9fafb', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#3B82F6" 
                  strokeWidth={3}
                  dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2 }}
                  name="Revenue"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sales Volume Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Sales Volume ({timePeriod})
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="displayPeriod" 
                  tick={{ fontSize: 12 }}
                  className="text-gray-600 dark:text-gray-400"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  className="text-gray-600 dark:text-gray-400"
                />
                <Tooltip 
                  labelStyle={{ color: '#374151' }}
                  contentStyle={{ 
                    backgroundColor: '#f9fafb', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px'
                  }}
                />
                <Legend />
                <Bar 
                  dataKey="openSales" 
                  fill="#3B82F6" 
                  name="Open Sales"
                  radius={[2, 2, 0, 0]}
                />
                <Bar 
                  dataKey="closedSales" 
                  fill="#10B981" 
                  name="Closed Sales"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Payment Methods Pie Chart */}
      {Object.keys(analytics.paymentMethodBreakdown).length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Payment Methods Distribution
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={Object.entries(analytics.paymentMethodBreakdown).map(([method, data], index) => ({
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
                    {Object.entries(analytics.paymentMethodBreakdown).map((entry, index) => (
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
              {Object.entries(analytics.paymentMethodBreakdown).map(([method, data]) => (
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
      )}

      {/* Individual Items Distribution Chart */}
      {analytics.inventoryUsed.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Individual Items Distribution
          </h3>
          
          {/* Item Toggle Controls */}
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                Toggle Items ({visibleItems.size} of {analytics.inventoryUsed.length} shown)
              </h4>
              <div className="flex gap-2">
                <button
                  onClick={() => setVisibleItems(new Set(analytics.inventoryUsed.map(item => item.name)))}
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
                  onClick={() => setVisibleItems(new Set(analytics.inventoryUsed.slice(0, 8).map(item => item.name)))}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                >
                  <RotateCcw size={12} />
                  Top 8
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {analytics.inventoryUsed.map((item, index) => (
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
                      data={visibleInventoryData.map((item, index) => ({
                        name: item.name,
                        value: item.count,
                        revenue: item.revenue,
                        type: item.type,
                        color: COLORS[analytics.inventoryUsed.findIndex(i => i.name === item.name) % COLORS.length]
                      }))}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name.length > 15 ? name.substring(0, 12) + '...' : name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {visibleInventoryData.map((item, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={COLORS[analytics.inventoryUsed.findIndex(i => i.name === item.name) % COLORS.length]} 
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
                Item Details ({analytics.inventoryUsed.length} total)
              </h4>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {analytics.inventoryUsed.map((item, index) => (
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
      )}

      {/* Services vs Items Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Services vs Items vs Freebies
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Count Distribution */}
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
                    { name: 'Freebies', value: analytics.freebieCount, color: '#EC4899' }
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
                    { name: 'Freebies', value: analytics.freebieCount, color: '#EC4899' }
                  ].filter(item => item.value > 0).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value, name) => [`${value} units`, name]}
                  contentStyle={{ 
                    backgroundColor: '#f9fafb', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue Distribution */}
          <div className="h-64">
            <h4 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-2 text-center">
              Revenue Distribution
            </h4>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Services', value: analytics.serviceRevenue, color: '#F59E0B' },
                    { name: 'Items', value: analytics.itemRevenue, color: '#06B6D4' }
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
                    { name: 'Items', value: analytics.itemRevenue, color: '#06B6D4' }
                  ].filter(item => item.value > 0).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value, name) => [safeFormatCurrency(value), name]}
                  contentStyle={{ 
                    backgroundColor: '#f9fafb', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Items and Services Count */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Services */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Services
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {analytics.serviceCount}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Services</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-500 dark:text-orange-300">
                {analytics.uniqueServices}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Unique Types</p>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <p className="text-lg font-bold text-orange-700 dark:text-orange-300">
              {safeFormatCurrency(analytics.serviceRevenue)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">Revenue</p>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Items
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                {analytics.itemCount}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Items</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-teal-500 dark:text-teal-300">
                {analytics.uniqueItems}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Unique Types</p>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <p className="text-lg font-bold text-teal-700 dark:text-teal-300">
              {safeFormatCurrency(analytics.itemRevenue)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">Revenue</p>
          </div>
        </div>

        {/* Freebies */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Freebies
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">
                {analytics.freebieCount}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Freebies</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-pink-500 dark:text-pink-300">
                {analytics.uniqueFreebies}
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
      {analytics.serviceBreakdown.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Services Breakdown
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
                {analytics.serviceBreakdown.map(service => (
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

      {/* Item Groups */}
      {analytics.itemGroups.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Item Categories Used
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {analytics.itemGroups.map(group => (
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
        </div>
      )}
    </div>
  );
}