import React, { useEffect } from "react";
import { useSales } from "../hooks/useSales";
import ListClosedSales from "../components/ListClosedSales";

const ClosedSales = () => {
  const { closedSales, loadSales, revertSale, deleteClosedSale, isLoading } = useSales();

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  if (isLoading) return <p>Loading sales...</p>;

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-3xl font-bold mb-6">Closed Sales</h1>
      <ListClosedSales
        closedSales={closedSales}
        revertSale={revertSale}
        deleteClosedSale={deleteClosedSale}
      />
    </div>
  );
};

export default ClosedSales;
