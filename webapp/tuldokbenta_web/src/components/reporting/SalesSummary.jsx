import React, { useMemo } from "react";

export default function SalesSummary({ openSales, closedSales, formatCurrency }) {
  const summary = useMemo(() => {
    const totalsService = {};
    const totalsItem = {};
    const totalsFreebie = {};

    const allSales = [...openSales, ...closedSales];

    allSales.forEach(sale => {
      sale.items.forEach(it => {
        const qty = it.qty || 1;
        const price = parseFloat(it.price || 0);

        if (it.type === "service") {
          if (!totalsService[it.service_name]) totalsService[it.service_name] = { qty: 0, price, total: 0 };
          totalsService[it.service_name].qty += qty;
          totalsService[it.service_name].total += price * qty;
        } else if (it.type === "item") {
          if (price === 0) {
            if (!totalsFreebie[it.item_name]) totalsFreebie[it.item_name] = 0;
            totalsFreebie[it.item_name] += qty;
          } else {
            if (!totalsItem[it.item_name]) totalsItem[it.item_name] = { qty: 0, price, total: 0 };
            totalsItem[it.item_name].qty += qty;
            totalsItem[it.item_name].total += price * qty;
          }
        }
      });
    });

    return { totalsService, totalsItem, totalsFreebie };
  }, [openSales, closedSales]);

  const Card = ({ title, children, bgClass }) => (
    <div className={`flex-1 p-4 rounded-lg shadow hover:shadow-lg transition ${bgClass}`}>
      <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 mb-2 text-center">{title}</h3>
      {children}
    </div>
  );

  const TableItems = ({ data, isFreebie }) => {
    if (!data || Object.keys(data).length === 0) {
      return <p className="text-gray-700 dark:text-gray-300 text-center">{isFreebie ? "No freebies given." : "No records."}</p>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-gray-700 dark:text-gray-300">
          <thead className="border-b border-gray-300 dark:border-gray-600">
            <tr>
              <th className="px-2 py-1">Name</th>
              {!isFreebie && <th className="px-2 py-1">Qty</th>}
              {!isFreebie && <th className="px-2 py-1">Price</th>}
              <th className="px-2 py-1">{isFreebie ? "Qty" : "Total"}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data).map(([name, val]) => (
              <tr key={name} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 transition">
                <td className="px-2 py-1">{name}</td>
                {!isFreebie && <td className="px-2 py-1">{val.qty}</td>}
                {!isFreebie && <td className="px-2 py-1">{formatCurrency(val.price)}</td>}
                <td className="px-2 py-1">{isFreebie ? val : formatCurrency(val.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <section className="mb-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg shadow">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 text-center">Sales Summary</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card title="Services" bgClass="bg-green-50 dark:bg-green-900">
          <TableItems data={summary.totalsService} />
        </Card>

        <Card title="Items" bgClass="bg-blue-50 dark:bg-blue-900">
          <TableItems data={summary.totalsItem} />
        </Card>

        <Card title="Freebies" bgClass="bg-yellow-50 dark:bg-yellow-900">
          <TableItems data={summary.totalsFreebie} isFreebie />
        </Card>
      </div>
    </section>
  );
}
