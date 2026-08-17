import React, { useEffect, useMemo, useState } from "react";
import { useSales } from "../hooks/useSales";
import ListClosedSales from "../components/closed-sales/ListClosedSales";
import DayPicker from "../components/closed-sales/DayPicker";
import SearchInput from "../components/shared/SearchInput";
import { todayISODate } from "../utils/dateRange";
import { filterSales } from "../utils/filterSales";
import { formatCurrency, saleTotal } from "../utils/format";

const ClosedSales = () => {
  const { closedSalesbyDate, loadClosedSalesForDay, revertSale, isLoading } =
    useSales();

  // Opens on today, as it always has — the difference is that the day is now
  // state the user can move rather than a constant baked into the fetch.
  const [selectedDate, setSelectedDate] = useState(todayISODate());
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadClosedSalesForDay(selectedDate);
  }, [loadClosedSalesForDay, selectedDate]);

  const visibleSales = useMemo(
    () => filterSales(closedSalesbyDate, query),
    [closedSalesbyDate, query]
  );

  const dayTotal = useMemo(
    () => closedSalesbyDate.reduce((sum, sale) => sum + saleTotal(sale), 0),
    [closedSalesbyDate]
  );

  const count = closedSalesbyDate.length;

  /**
   * revertSale re-runs loadSales, which refetches *today* — that would silently
   * throw the viewer back to today's numbers while they're looking at an older
   * day. Refetch the day actually on screen instead.
   */
  const handleRevert = async (id) => {
    await revertSale(id);
    await loadClosedSalesForDay(selectedDate);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-5 text-gray-800 dark:text-gray-100">
        Closed Sales
      </h1>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 mb-6 transition-colors space-y-4">
        <DayPicker value={selectedDate} onChange={setSelectedDate} />

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 pt-3">
            <span className="font-semibold text-gray-800 dark:text-gray-100">
              {count} {count === 1 ? "sale" : "sales"}
            </span>{" "}
            ·{" "}
            <span className="font-semibold text-green-700 dark:text-green-400">
              {formatCurrency(dayTotal)}
            </span>
          </p>

          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search invoice, item, or payment…"
            ariaLabel="Search closed sales"
            className="w-full sm:w-80 sm:ml-auto"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 transition-colors">
        {isLoading ? (
          <p className="py-10 text-center text-gray-500 dark:text-gray-400 animate-pulse">
            Loading sales…
          </p>
        ) : (
          <ListClosedSales
            closedSales={visibleSales}
            revertSale={handleRevert}
            // Lets the list tell "nothing happened that day" apart from
            // "nothing matched what you typed".
            emptyMessage={
              count === 0
                ? "No closed sales on this day."
                : `No closed sales match “${query}”.`
            }
          />
        )}
      </div>
    </div>
  );
};

export default ClosedSales;
