import React, { useMemo } from "react";

export default function ClosedSalesTotal({ closedSales, formatCurrency }) {
  const totals = useMemo(() => {
    const result = { cash: 0, gcash: 0 };
    closedSales.forEach(sale => {
      const total = sale.items.reduce((sum, i) => sum + i.price * (i.qty || 1), 0);
      if (sale.paid_using === "cash") result.cash += total;
      else if (sale.paid_using === "gcash") result.gcash += total;
    });
    return result;
  }, [closedSales]);

  return (
    <section className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
        Closed Sales Total by Payment Method
      </h3>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 p-3 bg-green-50 dark:bg-green-900 rounded-lg text-center">
          <p className="font-medium text-green-600 dark:text-green-300">Cash</p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{formatCurrency(totals.cash)}</p>
        </div>
        <div className="flex-1 p-3 bg-blue-50 dark:bg-blue-900 rounded-lg text-center">
          <p className="font-medium text-blue-600 dark:text-blue-300">GCash</p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{formatCurrency(totals.gcash)}</p>
        </div>
      </div>
    </section>
  );
}
