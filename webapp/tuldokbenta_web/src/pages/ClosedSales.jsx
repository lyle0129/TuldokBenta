import React, { useEffect } from "react";
import { useSales } from "../hooks/useSales";
import ListClosedSales from "../components/ListClosedSales";

const ClosedSales = () => {
  const { closedSales, loadSales, revertSale, deleteClosedSale, isLoading } = useSales();

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  if (isLoading)
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-gray-500 dark:text-gray-400 animate-pulse">
          Loading sales...
        </p>
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-800 dark:text-gray-100">
        Closed Sales
      </h1>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6 transition-colors">
        <ListClosedSales
          closedSales={closedSales}
          revertSale={revertSale}
          deleteClosedSale={deleteClosedSale}
          loadSales={loadSales}
        />
      </div>
    </div>
  );
};

export default ClosedSales;
