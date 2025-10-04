import { useEffect } from "react";
import { useApi } from "../hooks/useApi";

export default function ClosedSales() {
  const { data: sales, fetchData: fetchSales } = useApi(
    "http://localhost:5001/api/closed-sales"
  );

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Closed Sales</h2>
      <ul>
        {sales.map((s) => (
          <li key={s.id} className="border p-2 mb-2">
            {s.invoice_number} - Paid by {s.paid_using}
          </li>
        ))}
      </ul>
    </div>
  );
}
