import { useState, useEffect, useMemo } from "react";
import { useSales } from "../hooks/useSales";
import DateRangeFilter from "../components/DateRangeFilter";

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

  const paginate = (data, page) => {
    const start = (page - 1) * itemsPerPage;
    return data.slice(start, start + itemsPerPage);
  };

  const totalOpenPages = Math.ceil(filteredOpenSales.length / itemsPerPage);
  const totalClosedPages = Math.ceil(filteredClosedSales.length / itemsPerPage);

  // ---------- Handlers ----------
  const handleApply = (low, high) => {
    setLowDate(low);
    setHighDate(high);
    setOpenPage(1);
    setClosedPage(1);
  };

  const handleToday = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const formatted = `${yyyy}-${mm}-${dd}`;
    setLowDate(formatted);
    setHighDate(formatted);
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
        <button
          onClick={handleToday}
          className="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition"
        >
          Today
        </button>
        <div className="w-full mt-2 text-gray-800 dark:text-gray-200">
          Showing: {lowDate && highDate ? `${formatDate(lowDate)} - ${formatDate(highDate)}` : "All Dates"}
        </div>
      </div>

      {isLoading ? <p>Loading sales...</p> : (
        <>
          {/* ---------- Grand Total ---------- */}
          <section className="mb-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg shadow text-center">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-2 ">
              Grand Total: {formatCurrency(grandTotal)}
            </h2>
            <div className="flex justify-center gap-8 mt-4">
              <div className="flex-1">
                <p className="font-medium text-green-600">Open Sales</p>
                <p className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(openTotal)}</p>
              </div>
              <div className="flex-1">
                <p className="font-medium text-blue-600">Closed Sales</p>
                <p className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(closedTotal)}</p>
              </div>
            </div>
          </section>

          {/* ---------- Open & Closed Sales Side-by-Side ---------- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Open Sales */}
            <section>
              <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">
                Open Sales ({filteredOpenSales.length})
              </h2>
              {filteredOpenSales.length === 0 ? <p className="font-semibold text-gray-900 dark:text-gray-100">No open sales in this range.</p> : (
                <>
                  {paginate(filteredOpenSales, openPage).map((sale) => (
                    <div key={sale.id} className="border p-3 rounded mb-2 bg-gray-50 dark:bg-gray-800">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">Invoice #{sale.invoice_number}</p>
                      <p className="text-gray-700 dark:text-gray-300">Date: {formatDate(sale.created_at)}</p>
                      <p className="text-gray-900 dark:text-gray-100">
                        Total: {formatCurrency(sale.items.reduce((sum, i) => sum + i.price * (i.qty || 1), 0))}
                      </p>
                      <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300">
                        {sale.items.map(it => it.type === "service" ? `${it.service_name} x${it.qty || 1}` : `${it.item_name} x${it.qty || 1}`)
                          .map((line, idx) => <li key={idx}>{line}</li>)}
                      </ul>
                    </div>
                  ))}
                  {/* Pagination */}
                  <div className="flex justify-between mt-2 text-gray-900 dark:text-gray-100">
                    <button disabled={openPage === 1} onClick={() => setOpenPage(p => p - 1)} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50">Previous</button>
                    <span>Page {openPage} of {totalOpenPages}</span>
                    <button disabled={openPage === totalOpenPages} onClick={() => setOpenPage(p => p + 1)} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50">Next</button>
                  </div>
                </>
              )}
            </section>

            {/* Closed Sales */}
            <section>
              <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">
                Closed Sales ({filteredClosedSales.length})
              </h2>
              {filteredClosedSales.length === 0 ? <p className="font-semibold text-gray-900 dark:text-gray-100">No closed sales in this range.</p> : (
                <>
                  {paginate(filteredClosedSales, closedPage).map((sale) => (
                    <div key={sale.id} className="border p-3 rounded mb-2 bg-gray-50 dark:bg-gray-800">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">Invoice #{sale.invoice_number}</p>
                      <p className="text-gray-700 dark:text-gray-300">Created: {formatDate(sale.created_at)}</p>
                      <p className="text-gray-700 dark:text-gray-300">Paid: {formatDate(sale.paid_at)}</p>
                      <p className="text-gray-900 dark:text-gray-100">
                        Total: {formatCurrency(sale.items.reduce((sum, i) => sum + i.price * (i.qty || 1), 0))}
                      </p>
                      <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300">
                        {sale.items.map(it => it.type === "service" ? `${it.service_name} x${it.qty || 1}` : `${it.item_name} x${it.qty || 1}`)
                          .map((line, idx) => <li key={idx}>{line}</li>)}
                      </ul>
                    </div>
                  ))}
                  {/* Pagination */}
                  <div className="flex justify-between mt-2 text-gray-900 dark:text-gray-100">
                    <button disabled={closedPage === 1} onClick={() => setClosedPage(p => p - 1)} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50">Previous</button>
                    <span>Page {closedPage} of {totalClosedPages}</span>
                    <button disabled={closedPage === totalClosedPages} onClick={() => setClosedPage(p => p + 1)} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50">Next</button>
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
