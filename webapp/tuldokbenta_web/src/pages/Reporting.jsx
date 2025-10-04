// src/pages/Reporting.jsx
import { useState, useEffect, useMemo } from "react";
import { useSales } from "../hooks/useSales";
import DateRangeFilter from "../components/DateRangeFilter";

export default function Reporting() {
  const { openSales, closedSales, loadSales, isLoading } = useSales();
  const [lowDate, setLowDate] = useState("");
  const [highDate, setHighDate] = useState("");

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  // ---------- Date Filtering ----------
  const filterByDate = (sales) => {
    if (!lowDate || !highDate) return sales;
    const start = new Date(lowDate);
    const end = new Date(highDate);
    end.setHours(23, 59, 59, 999);
    return sales.filter((s) => {
      const created = new Date(s.created_at);
      return created >= start && created <= end;
    });
  };

  const filteredOpenSales = useMemo(() => filterByDate(openSales), [openSales, lowDate, highDate]);
  const filteredClosedSales = useMemo(() => filterByDate(closedSales), [closedSales, lowDate, highDate]);

  // ---------- Group closed sales by payment method ----------
  const closedByPayment = useMemo(() => {
    return filteredClosedSales.reduce((acc, sale) => {
      const method = sale.paymentMethod || "Unknown";
      if (!acc[method]) acc[method] = [];
      acc[method].push(sale);
      return acc;
    }, {});
  }, [filteredClosedSales]);

  // ---------- Totals ----------
  const { totalsByItem, totalsByService, totalsFreebies, grandTotal } = useMemo(() => {
    const totalsItem = {};
    const totalsService = {};
    let totalFreebies = 0;
    let grand = 0;

    const allSales = [...filteredOpenSales, ...filteredClosedSales];

    allSales.forEach((sale) => {
      sale.items.forEach((it) => {
        const qty = it.qty || 1;
        const price = it.price * qty;
        grand += price;

        // Items / Services
        if (it.type === "item") {
          if (!totalsItem[it.item_name]) totalsItem[it.item_name] = { qty: 0, total: 0 };
          totalsItem[it.item_name].qty += qty;
          totalsItem[it.item_name].total += price;
        } else if (it.type === "service") {
          if (!totalsService[it.service_name]) totalsService[it.service_name] = { qty: 0, total: 0 };
          totalsService[it.service_name].qty += qty;
          totalsService[it.service_name].total += price;
        }

        // Freebies
        if (it.freebies?.length > 0) {
          it.freebies.forEach((f) => {
            f.choices.forEach((c) => {
              totalFreebies += c.qty;
            });
          });
        }
      });
    });

    return { totalsByItem: totalsItem, totalsByService: totalsService, totalsFreebies: totalFreebies, grandTotal: grand };
  }, [filteredOpenSales, filteredClosedSales]);

  // ---------- Utilities ----------
  const formatDate = (date) => new Date(date).toLocaleDateString();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Sales Reporting</h1>

      {/* Date Filter */}
      <DateRangeFilter
        onApply={(low, high) => {
          setLowDate(low);
          setHighDate(high);
        }}
        onReset={() => {
          setLowDate("");
          setHighDate("");
        }}
      />

      {isLoading ? (
        <p className="mt-4">Loading sales...</p>
      ) : (
        <>
          {/* ---------- Summary ---------- */}
          <section className="mt-6 mb-6 p-4 bg-gray-100 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3">Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="p-3 bg-white rounded shadow text-center">
                <p className="font-medium">Open Sales</p>
                <p className="font-bold text-green-600">
                  ₱{filteredOpenSales.reduce((sum, s) => sum + s.items.reduce((a, i) => a + i.price * (i.qty || 1), 0), 0).toFixed(2)}
                </p>
              </div>
              <div className="p-3 bg-white rounded shadow text-center">
                <p className="font-medium">Closed Sales</p>
                <p className="font-bold text-blue-600">
                  ₱{filteredClosedSales.reduce((sum, s) => sum + s.items.reduce((a, i) => a + i.price * (i.qty || 1), 0), 0).toFixed(2)}
                </p>
              </div>
              <div className="p-3 bg-white rounded shadow text-center">
                <p className="font-medium">Items Sold</p>
                <p className="font-bold">{Object.keys(totalsByItem).length}</p>
              </div>
              <div className="p-3 bg-white rounded shadow text-center">
                <p className="font-medium">Services Rendered</p>
                <p className="font-bold">{Object.keys(totalsByService).length}</p>
              </div>
              <div className="p-3 bg-white rounded shadow text-center">
                <p className="font-medium">Freebies Used</p>
                <p className="font-bold">{totalsFreebies}</p>
              </div>
            </div>

            <h3 className="mt-4 font-bold text-lg">Grand Total: ₱{grandTotal.toFixed(2)}</h3>
          </section>

          {/* ---------- Open Sales ---------- */}
          <section className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Open Sales ({filteredOpenSales.length})</h2>
            {filteredOpenSales.length === 0 ? (
              <p>No open sales in this range.</p>
            ) : (
              filteredOpenSales.map((sale) => (
                <div key={sale.id} className="border p-3 rounded mb-2 bg-gray-50">
                  <p className="font-semibold">Invoice #{sale.invoice_number}</p>
                  <p>Date: {formatDate(sale.created_at)}</p>
                  <p>Total: ₱{sale.items.reduce((sum, i) => sum + i.price * (i.qty || 1), 0).toFixed(2)}</p>

                  <ul className="list-disc pl-5">
                    {sale.items.map((it, i) =>
                      it.type === "service" ? `${it.service_name} x${it.qty || 1}` : `${it.item_name} x${it.qty || 1}`
                    ).map((line, idx) => <li key={idx}>{line}</li>)}
                  </ul>
                </div>
              ))
            )}
          </section>

          {/* ---------- Closed Sales by Payment Method ---------- */}
          <section className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Closed Sales ({filteredClosedSales.length})</h2>
            {Object.keys(closedByPayment).length === 0 ? (
              <p>No closed sales in this range.</p>
            ) : (
              Object.entries(closedByPayment).map(([method, sales]) => (
                <div key={method} className="mb-4">
                  <h3 className="font-semibold mb-1">Payment Method: {method.toUpperCase()}</h3>
                  {sales.map((sale) => (
                    <div key={sale.id} className="border p-3 rounded mb-2 bg-gray-50">
                      <p className="font-semibold">Invoice #{sale.invoice_number}</p>
                      <p>Created: {formatDate(sale.created_at)}</p>
                      <p>Paid: {formatDate(sale.paid_at)}</p>
                      <p>Total: ₱{sale.items.reduce((sum, i) => sum + i.price * (i.qty || 1), 0).toFixed(2)}</p>

                      <ul className="list-disc pl-5">
                        {sale.items.map((it, i) =>
                          it.type === "service" ? `${it.service_name} x${it.qty || 1}` : `${it.item_name} x${it.qty || 1}`
                        ).map((line, idx) => <li key={idx}>{line}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              ))
            )}
          </section>

          {/* ---------- Freebies ---------- */}
          <section className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Freebies Used</h2>
            {totalsFreebies === 0 ? (
              <p>No freebies used in this range.</p>
            ) : (
              <>
                {[...filteredOpenSales, ...filteredClosedSales].flatMap((sale) =>
                  sale.items.flatMap((it, idx) =>
                    it.freebies?.flatMap((f) =>
                      f.choices.map((c, ci) => (
                        <div key={`${sale.id}-${idx}-${ci}`} className="border p-2 rounded mb-1 bg-gray-50">
                          <p>{c.item} x{c.qty} (Invoice #{sale.invoice_number})</p>
                        </div>
                      ))
                    ) || []
                  )
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
