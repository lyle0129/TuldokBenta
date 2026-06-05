import { useState, useEffect, useMemo } from "react";
import { useSales } from "../hooks/useSales";
import AdvancedFilters from "../components/AdvancedFilters";
import EnhancedSalesList from "../components/EnhancedSalesList";
import TodaysSummary from "../components/TodaysSummary";
import OverviewSummary from "../components/OverviewSummary";
import GrandTotalCard from "../components/GrandTotalCard";
import SalesSummary from "../components/SalesSummary";
import ClosedSalesTotal from "../components/ClosedSalesTotal";

export default function Reporting() {
  const { openSales, closedSales, loadSales, isLoading } = useSales();
  const [filters, setFilters] = useState({
    invoiceNumber: '',
    serviceName: '',
    serviceType: 'all',
    paymentMethod: 'all',
    searchQuery: '',
    dateRange: { from: '', to: '' }
  });
  const [activeTab, setActiveTab] = useState('today'); // 'today', 'overview', 'open', 'closed'

  useEffect(() => { loadSales(); }, [loadSales]);

  // Get today's date boundaries
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Today's sales filters
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

  const closedSalesTodayFromPrevious = useMemo(() => {
    return closedSales.filter(sale => {
      if (!sale.paid_at) return false;
      
      const createdDate = new Date(sale.created_at);
      const paidDate = new Date(sale.paid_at);
      
      return createdDate < today && paidDate >= today && paidDate < tomorrow;
    });
  }, [closedSales, today, tomorrow]);

  // Apply all filters to sales data
  const applyFilters = (sales, includePaymentFilters = false) => {
    return sales.filter(sale => {
      // Global search filter
      if (filters.searchQuery) {
        const searchTerm = filters.searchQuery.toLowerCase();
        const matchesInvoice = sale.invoice_number.toLowerCase().includes(searchTerm);
        const matchesItems = sale.items.some(item => {
          if (item.type === 'service') {
            return item.service_name.toLowerCase().includes(searchTerm);
          } else if (item.type === 'item') {
            return item.item_name.toLowerCase().includes(searchTerm);
          }
          return false;
        });
        const matchesPayment = sale.paid_using && sale.paid_using.toLowerCase().includes(searchTerm);
        
        if (!matchesInvoice && !matchesItems && !matchesPayment) {
          return false;
        }
      }

      // Date range filter
      if (filters.dateRange.from && filters.dateRange.to) {
        const start = new Date(filters.dateRange.from);
        start.setHours(0, 0, 0, 0);
        const end = new Date(filters.dateRange.to);
        end.setHours(23, 59, 59, 999);
        
        const saleDate = new Date(sale.created_at);
        if (saleDate < start || saleDate > end) return false;
      }

      // Invoice number filter
      if (filters.invoiceNumber) {
        if (!sale.invoice_number.toLowerCase().includes(filters.invoiceNumber.toLowerCase())) {
          return false;
        }
      }

      // Service name filter
      if (filters.serviceName) {
        const hasService = sale.items.some(item => 
          item.type === 'service' && item.service_name === filters.serviceName
        );
        if (!hasService) return false;
      }

      // Service type filter
      if (filters.serviceType !== 'all') {
        const hasType = sale.items.some(item => item.type === filters.serviceType);
        if (!hasType) return false;
      }

      // Payment method filter (only for closed sales)
      if (includePaymentFilters && filters.paymentMethod !== 'all') {
        if (sale.paid_using !== filters.paymentMethod) return false;
      }

      return true;
    });
  };

  const filteredOpenSales = useMemo(() => applyFilters(openSales), [openSales, filters]);
  const filteredClosedSales = useMemo(() => applyFilters(closedSales, true), [closedSales, filters]);

  // Calculate totals
  const openTotal = useMemo(() =>
    filteredOpenSales.reduce((sum, sale) => 
      sum + sale.items.reduce((a, i) => a + i.price * (i.qty || 1), 0), 0
    ), [filteredOpenSales]
  );

  const closedTotal = useMemo(() =>
    filteredClosedSales.reduce((sum, sale) => 
      sum + sale.items.reduce((a, i) => a + i.price * (i.qty || 1), 0), 0
    ), [filteredClosedSales]
  );

  const grandTotal = openTotal + closedTotal;
  const formatCurrency = (value) => `₱${value.toFixed(2)}`;
  const formatDate = (date) => new Date(date).toLocaleDateString();

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
  };

  const handleFiltersReset = () => {
    setFilters({
      invoiceNumber: '',
      serviceName: '',
      serviceType: 'all',
      paymentMethod: 'all',
      searchQuery: '',
      dateRange: { from: '', to: '' }
    });
  };

  // Get service analytics
  const serviceAnalytics = useMemo(() => {
    const allSales = [...filteredOpenSales, ...filteredClosedSales];
    const serviceStats = {};
    
    allSales.forEach(sale => {
      sale.items.forEach(item => {
        if (item.type === 'service') {
          const serviceName = item.service_name;
          if (!serviceStats[serviceName]) {
            serviceStats[serviceName] = { count: 0, revenue: 0 };
          }
          serviceStats[serviceName].count += item.qty || 1;
          serviceStats[serviceName].revenue += item.price * (item.qty || 1);
        }
      });
    });

    return Object.entries(serviceStats)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredOpenSales, filteredClosedSales]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100">
        Sales Reporting Dashboard
      </h1>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="text-lg text-gray-600 dark:text-gray-400">Loading sales data...</div>
        </div>
      ) : (
        <>
          {/* Tab Navigation */}
          <div className="mb-6">
            <div className="border-b border-gray-200 dark:border-gray-600">
              <nav className="-mb-px flex space-x-8">
                {[
                  { id: 'today', label: 'Today', count: todaysOpenSales.length + todaysClosedSales.length + closedSalesTodayFromPrevious.length },
                  { id: 'overview', label: 'Overview', count: filteredOpenSales.length + filteredClosedSales.length },
                  { id: 'open', label: 'Open Sales', count: filteredOpenSales.length },
                  { id: 'closed', label: 'Closed Sales', count: filteredClosedSales.length }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Today Tab */}
          {activeTab === 'today' && (
            <div className="space-y-6">
              {/* Today's Summary */}
              <TodaysSummary
                openSales={openSales}
                closedSales={closedSales}
                formatCurrency={formatCurrency}
              />

              {/* Today's Sales Lists */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <EnhancedSalesList
                  title="Open Sales Today"
                  sales={todaysOpenSales}
                  formatDate={formatDate}
                  formatCurrency={formatCurrency}
                  itemsPerPage={5}
                  showPaymentInfo={false}
                />
                <EnhancedSalesList
                  title="Closed Sales Today"
                  sales={todaysClosedSales}
                  formatDate={formatDate}
                  formatCurrency={formatCurrency}
                  itemsPerPage={5}
                  showPaymentInfo={true}
                />
                <EnhancedSalesList
                  title="Previous Days Paid Today"
                  sales={closedSalesTodayFromPrevious}
                  formatDate={formatDate}
                  formatCurrency={formatCurrency}
                  itemsPerPage={5}
                  showPaymentInfo={true}
                />
              </div>
            </div>
          )}

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Advanced Filters */}
              <AdvancedFilters
                sales={[...openSales, ...closedSales]}
                onFiltersChange={handleFiltersChange}
                onReset={handleFiltersReset}
              />

              {/* Overview Summary */}
              <OverviewSummary
                openSales={filteredOpenSales}
                closedSales={filteredClosedSales}
                formatCurrency={formatCurrency}
                filters={filters}
                allOpenSales={openSales}
                allClosedSales={closedSales}
              />

              {/* Recent Sales Preview */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <EnhancedSalesList
                  title="Recent Open Sales"
                  sales={filteredOpenSales.slice(0, 5)}
                  formatDate={formatDate}
                  formatCurrency={formatCurrency}
                  itemsPerPage={5}
                  showPaymentInfo={false}
                />
                <EnhancedSalesList
                  title="Recent Closed Sales"
                  sales={filteredClosedSales.slice(0, 5)}
                  formatDate={formatDate}
                  formatCurrency={formatCurrency}
                  itemsPerPage={5}
                  showPaymentInfo={true}
                />
              </div>
            </div>
          )}

          {/* Open Sales Tab */}
          {activeTab === 'open' && (
            <div className="space-y-6">
              <AdvancedFilters
                sales={[...openSales, ...closedSales]}
                onFiltersChange={handleFiltersChange}
                onReset={handleFiltersReset}
              />
              <EnhancedSalesList
                title="Open Sales"
                sales={filteredOpenSales}
                formatDate={formatDate}
                formatCurrency={formatCurrency}
                itemsPerPage={10}
                showPaymentInfo={false}
              />
            </div>
          )}

          {/* Closed Sales Tab */}
          {activeTab === 'closed' && (
            <div className="space-y-6">
              <AdvancedFilters
                sales={[...openSales, ...closedSales]}
                onFiltersChange={handleFiltersChange}
                onReset={handleFiltersReset}
              />
              <EnhancedSalesList
                title="Closed Sales"
                sales={filteredClosedSales}
                formatDate={formatDate}
                formatCurrency={formatCurrency}
                itemsPerPage={10}
                showPaymentInfo={true}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}