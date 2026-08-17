import React, { useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';

export default function EnhancedSalesList({
  title,
  sales,
  formatDate,
  formatCurrency,
  itemsPerPage = 10,
  showPaymentInfo = false
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState('created_at'); // 'created_at', 'paid_at', 'total', 'invoice_number'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'
  const [expandedSales, setExpandedSales] = useState(new Set());

  // Calculate totals for each sale
  const salesWithTotals = sales.map(sale => ({
    ...sale,
    total: sale.items.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0)
  }));

  // Sort sales
  const sortedSales = [...salesWithTotals].sort((a, b) => {
    let aValue, bValue;
    
    switch (sortBy) {
      case 'created_at':
        aValue = new Date(a.created_at);
        bValue = new Date(b.created_at);
        break;
      case 'paid_at':
        aValue = a.paid_at ? new Date(a.paid_at) : new Date(0);
        bValue = b.paid_at ? new Date(b.paid_at) : new Date(0);
        break;
      case 'total':
        aValue = a.total;
        bValue = b.total;
        break;
      case 'invoice_number':
        aValue = a.invoice_number;
        bValue = b.invoice_number;
        break;
      default:
        aValue = a.created_at;
        bValue = b.created_at;
    }

    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  // Pagination
  const totalPages = Math.ceil(sortedSales.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedSales = sortedSales.slice(startIndex, startIndex + itemsPerPage);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  const toggleExpanded = (saleId) => {
    const newExpanded = new Set(expandedSales);
    if (newExpanded.has(saleId)) {
      newExpanded.delete(saleId);
    } else {
      newExpanded.add(saleId);
    }
    setExpandedSales(newExpanded);
  };

  const getSortIcon = (field) => {
    if (sortBy !== field) return <ChevronsUpDown size={14} />;
    return sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  // Calculate summary stats
  const totalAmount = sortedSales.reduce((sum, sale) => sum + sale.total, 0);
  const averageAmount = sortedSales.length > 0 ? totalAmount / sortedSales.length : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md">
      {/* Header with stats */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-600">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h2>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {sortedSales.length} sales
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
            <div className="text-blue-600 dark:text-blue-400 font-medium">Total Amount</div>
            <div className="text-lg font-bold text-blue-800 dark:text-blue-300">
              {formatCurrency(totalAmount)}
            </div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded">
            <div className="text-green-600 dark:text-green-400 font-medium">Average Sale</div>
            <div className="text-lg font-bold text-green-800 dark:text-green-300">
              {formatCurrency(averageAmount)}
            </div>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 p-2 rounded">
            <div className="text-purple-600 dark:text-purple-400 font-medium">Count</div>
            <div className="text-lg font-bold text-purple-800 dark:text-purple-300">
              {sortedSales.length}
            </div>
          </div>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400 mr-2">Sort by:</span>
          <button
            onClick={() => handleSort('created_at')}
            className={`px-3 py-1 rounded text-sm ${
              sortBy === 'created_at' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-1">
              Created {getSortIcon('created_at')}
            </span>
          </button>
          {showPaymentInfo && (
            <button
              onClick={() => handleSort('paid_at')}
              className={`px-3 py-1 rounded text-sm ${
                sortBy === 'paid_at' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
              }`}
            >
              <span className="flex items-center gap-1">
                Paid {getSortIcon('paid_at')}
              </span>
            </button>
          )}
          <button
            onClick={() => handleSort('total')}
            className={`px-3 py-1 rounded text-sm ${
              sortBy === 'total' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-1">
              Amount {getSortIcon('total')}
            </span>
          </button>
          <button
            onClick={() => handleSort('invoice_number')}
            className={`px-3 py-1 rounded text-sm ${
              sortBy === 'invoice_number' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-1">
              Invoice {getSortIcon('invoice_number')}
            </span>
          </button>
        </div>
      </div>

      {/* Sales List */}
      <div className="divide-y divide-gray-200 dark:divide-gray-600">
        {paginatedSales.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No sales found matching the current filters.
          </div>
        ) : (
          paginatedSales.map((sale) => (
            <div key={sale.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {sale.invoice_number}
                    </h3>
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(sale.total)}
                    </span>
                    {showPaymentInfo && sale.paid_using && (
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs">
                        {sale.paid_using}
                      </span>
                    )}
                  </div>
                  
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <span>Created: {formatDate(sale.created_at)}</span>
                    {showPaymentInfo && sale.paid_at && (
                      <span className="ml-4">Paid: {formatDate(sale.paid_at)}</span>
                    )}
                  </div>

                  {/* Items Preview */}
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    {expandedSales.has(sale.id) ? (
                      <div className="space-y-1">
                        {sale.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center py-1 px-2 bg-gray-50 dark:bg-gray-600 rounded">
                            <span>
                              {item.type === 'service' ? item.service_name : item.item_name} 
                              <span className="text-gray-500 dark:text-gray-400"> x{item.qty || 1}</span>
                            </span>
                            <span className="font-medium">
                              {formatCurrency(item.price * (item.qty || 1))}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>
                        {sale.items.map((item, idx) => (
                          <span key={idx}>
                            {item.type === 'service' ? item.service_name : item.item_name}
                            {idx < sale.items.length - 1 && ', '}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => toggleExpanded(sale.id)}
                  className="ml-4 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-transform duration-200"
                >
                  {expandedSales.has(sale.id) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, sortedSales.length)} of {sortedSales.length}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-gray-700 dark:text-gray-300">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}