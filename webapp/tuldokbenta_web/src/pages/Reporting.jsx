import { useState, useEffect, useMemo } from "react";
import { useSales } from "../hooks/useSales";
import DateRangeFilter from "../components/DateRangeFilter";
import GrandTotalCard from "../components/GrandTotalCard";
import SalesList from "../components/SalesList";
import SalesSummary from "../components/SalesSummary";
import ClosedSalesTotal from "../components/ClosedSalesTotal";

export default function Reporting() {
  const { openSales, closedSales, loadSales, isLoading } = useSales();

  const [lowDate, setLowDate] = useState("");
  const [highDate, setHighDate] = useState("");

  const [openPage, setOpenPage] = useState(1);
  const [closedPage, setClosedPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => { loadSales(); }, [loadSales]);

  // ---------- Date Filtering ----------
  const filterByDate = (sales) => {
    if (!lowDate || !highDate) return sales;

    const start = new Date(lowDate);
    start.setHours(0, 0, 0, 0); // start of the day
    const end = new Date(highDate);
    end.setHours(23, 59, 59, 999); // end of the day

    return sales.filter((s) => {
      const created = new Date(s.created_at);
      return created >= start && created <= end;
    });
  };

  const filteredOpenSales = useMemo(() => filterByDate(openSales), [openSales, lowDate, highDate]);
  const filteredClosedSales = useMemo(() => filterByDate(closedSales), [closedSales, lowDate, highDate]);

  const openTotal = useMemo(() =>
    filteredOpenSales.reduce((sum, sale) => sum + sale.items.reduce((a, i) => a + i.price * (i.qty || 1), 0), 0),
    [filteredOpenSales]
  );

  const closedTotal = useMemo(() =>
    filteredClosedSales.reduce((sum, sale) => sum + sale.items.reduce((a, i) => a + i.price * (i.qty || 1), 0), 0),
    [filteredClosedSales]
  );

  const grandTotal = openTotal + closedTotal;

  const formatDate = (date) => new Date(date).toLocaleDateString();
  const formatCurrency = (value) => `₱${value.toFixed(2)}`;

  const totalOpenPages = Math.ceil(filteredOpenSales.length / itemsPerPage);
  const totalClosedPages = Math.ceil(filteredClosedSales.length / itemsPerPage);

  // ---------- Handlers ----------
  const handleApply = (low, high) => {
    setLowDate(low);
    setHighDate(high);
    setOpenPage(1);
    setClosedPage(1);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">Sales Reporting</h1>

      {/* ---------- Date Range Filter Component ---------- */}
      <div className="sticky top-0 bg-gray-100 dark:bg-gray-900 p-4 rounded shadow mb-4 z-10 flex flex-wrap items-end gap-4">
        <DateRangeFilter
          onApply={handleApply}
          onReset={() => { setLowDate(""); setHighDate(""); setOpenPage(1); setClosedPage(1); }}
        />
      </div>

      {isLoading ? <p>Loading sales...</p> : (
        <>

          {/*  ---------- Sales Summary  ---------- */}
          <SalesSummary
            openSales={filteredOpenSales}
            closedSales={filteredClosedSales}
            formatCurrency={formatCurrency}
          />


          {/* ---------- Grand Total ---------- */}
          <GrandTotalCard 
            grandTotal={grandTotal} 
            openTotal={openTotal} 
            closedTotal={closedTotal} 
            formatCurrency={formatCurrency} 
          />

          {/* Closed Sales total */}
          <ClosedSalesTotal
            closedSales={filteredClosedSales}
            formatCurrency={formatCurrency}
          />



          {/* ---------- Open & Closed Sales Side-by-Side ---------- */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-6">
            <SalesList
              title="Open Sales"
              sales={filteredOpenSales}
              currentPage={openPage}
              totalPages={totalOpenPages}
              onPrevPage={() => setOpenPage(p => p - 1)}
              onNextPage={() => setOpenPage(p => p + 1)}
              formatDate={formatDate}
              formatCurrency={formatCurrency}
            />

            <SalesList
              title="Closed Sales"
              sales={filteredClosedSales}
              currentPage={closedPage}
              totalPages={totalClosedPages}
              onPrevPage={() => setClosedPage(p => p - 1)}
              onNextPage={() => setClosedPage(p => p + 1)}
              formatDate={formatDate}
              formatCurrency={formatCurrency}
            />
          </div>
        </>
      )}
    </div>
  );
}
