import React from "react";

export default function GrandTotalCard({ grandTotal, openTotal, closedTotal, formatCurrency }) {
  return (
    <section className="mb-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg shadow text-center">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Grand Total
      </h2>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        {formatCurrency(grandTotal)}
      </p>

      <div className="flex flex-col md:flex-row justify-center gap-6">
        {/* Open Sales Card */}
        <div className="flex-1 p-4 bg-green-50 dark:bg-green-900 rounded-lg shadow hover:shadow-lg transition text-center">
          <p className="font-medium text-green-600 dark:text-green-300">Open Sales</p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-2">
            {formatCurrency(openTotal)}
          </p>
        </div>

        {/* Closed Sales Card */}
        <div className="flex-1 p-4 bg-blue-50 dark:bg-blue-900 rounded-lg shadow hover:shadow-lg transition text-center">
          <p className="font-medium text-blue-600 dark:text-blue-300">Closed Sales</p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-2">
            {formatCurrency(closedTotal)}
          </p>
        </div>
      </div>
    </section>
  );
}
