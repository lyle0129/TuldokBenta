import { useState, useEffect } from "react";

export default function AdvancedFilters({ 
  sales, 
  onFiltersChange, 
  onReset 
}) {
  const [filters, setFilters] = useState({
    invoiceNumber: '',
    serviceName: '',
    serviceType: 'all', // 'all', 'service', 'item'
    paymentMethod: 'all', // 'all', 'cash', 'gcash', etc.
    searchQuery: '', // New search field
    dateRange: {
      from: '',
      to: ''
    }
  });

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Extract unique service names and payment methods from sales data
  const uniqueServiceNames = [...new Set(
    sales.flatMap(sale => 
      sale.items
        .filter(item => item.type === 'service')
        .map(item => item.service_name)
    )
  )].filter(Boolean).sort();

  const uniquePaymentMethods = [...new Set(
    sales
      .filter(sale => sale.paid_using)
      .map(sale => sale.paid_using)
  )].filter(Boolean).sort();

  // Get today's date for default values
  const today = new Date();
  const formattedToday = today.toISOString().split('T')[0];

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleDateRangeChange = (key, value) => {
    const newDateRange = { ...filters.dateRange, [key]: value };
    const newFilters = { ...filters, dateRange: newDateRange };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleReset = () => {
    const resetFilters = {
      invoiceNumber: '',
      serviceName: '',
      serviceType: 'all',
      paymentMethod: 'all',
      searchQuery: '',
      dateRange: { from: '', to: '' }
    };
    setFilters(resetFilters);
    onReset();
  };

  const handleToday = () => {
    const todayFilters = {
      ...filters,
      dateRange: { from: formattedToday, to: formattedToday }
    };
    setFilters(todayFilters);
    onFiltersChange(todayFilters);
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Filters
        </h3>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
        </button>
      </div>

      {/* Basic Filters - Always Visible */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        {/* Global Search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Search
          </label>
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => handleFilterChange('searchQuery', e.target.value)}
            placeholder="Search invoice, service, item..."
            className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>

        {/* Date Range */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Date Range
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              value={filters.dateRange.from}
              onChange={(e) => handleDateRangeChange('from', e.target.value)}
              className="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              placeholder="From"
            />
            <input
              type="date"
              value={filters.dateRange.to}
              onChange={(e) => handleDateRangeChange('to', e.target.value)}
              className="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              placeholder="To"
            />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-col justify-end">
          <div className="flex gap-2">
            <button
              onClick={handleToday}
              className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
            >
              Today
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-sm"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Filters - Collapsible */}
      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-200 dark:border-gray-600">
          {/* Invoice Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Invoice Number
            </label>
            <input
              type="text"
              value={filters.invoiceNumber}
              onChange={(e) => handleFilterChange('invoiceNumber', e.target.value)}
              placeholder="INV-3201"
              className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>

          {/* Service Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Service Name
            </label>
            <select
              value={filters.serviceName}
              onChange={(e) => handleFilterChange('serviceName', e.target.value)}
              className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">All Services</option>
              {uniqueServiceNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Service Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Item Type
            </label>
            <select
              value={filters.serviceType}
              onChange={(e) => handleFilterChange('serviceType', e.target.value)}
              className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="all">All Types</option>
              <option value="service">Services Only</option>
              <option value="item">Items Only</option>
            </select>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Payment Method
            </label>
            <select
              value={filters.paymentMethod}
              onChange={(e) => handleFilterChange('paymentMethod', e.target.value)}
              className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="all">All Methods</option>
              {uniquePaymentMethods.map(method => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Active Filters Display */}
      {(filters.searchQuery || filters.invoiceNumber || filters.serviceName || filters.serviceType !== 'all' || 
        filters.paymentMethod !== 'all' || filters.dateRange.from || filters.dateRange.to) && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Active filters:</span>
            {filters.searchQuery && (
              <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded text-sm">
                Search: "{filters.searchQuery}"
              </span>
            )}
            {filters.dateRange.from && filters.dateRange.to && (
              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-sm">
                {filters.dateRange.from} to {filters.dateRange.to}
              </span>
            )}
            {filters.invoiceNumber && (
              <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-sm">
                Invoice: {filters.invoiceNumber}
              </span>
            )}
            {filters.serviceName && (
              <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded text-sm">
                Service: {filters.serviceName}
              </span>
            )}
            {filters.serviceType !== 'all' && (
              <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 rounded text-sm">
                Type: {filters.serviceType}
              </span>
            )}
            {filters.paymentMethod !== 'all' && (
              <span className="px-2 py-1 bg-pink-100 dark:bg-pink-900 text-pink-800 dark:text-pink-200 rounded text-sm">
                Payment: {filters.paymentMethod}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}