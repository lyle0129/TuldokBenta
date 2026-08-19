import React, { useMemo, useState } from "react";
import { useClosedSalesForDay, useSaleMutations } from "../hooks/useSales";
import ListClosedSales from "../components/closed-sales/ListClosedSales";
import DayPicker from "../components/closed-sales/DayPicker";
import SearchInput from "../components/shared/SearchInput";
import { todayISODate } from "../utils/dateRange";
import { filterSales } from "../utils/filterSales";
import { formatCurrency, saleTotal } from "../utils/format";

const ClosedSales = () => {
  // Opens on today, as it always has — the difference is that the day is now
  // state the user can move rather than a constant baked into the fetch.
  const [selectedDate, setSelectedDate] = useState(todayISODate());
  const [query, setQuery] = useState("");

  // Cached per day, so stepping back through the week only pays for days not
  // visited yet, and a slow response for a day already navigated away from
  // can't overwrite the one on screen.
  const { closedSalesbyDate, isLoading, error } =
    useClosedSalesForDay(selectedDate);
  const { revertSale, updateClosedSale } = useSaleMutations();

  const visibleSales = useMemo(
    () => filterSales(closedSalesbyDate, query),
    [closedSalesbyDate, query]
  );

  const dayTotal = useMemo(
    () => closedSalesbyDate.reduce((sum, sale) => sum + saleTotal(sale), 0),
    [closedSalesbyDate]
  );

  const count = closedSalesbyDate.length;

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
            placeholder="Search invoice, customer, item, or payment…"
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
        ) : error ? (
          // A failed read used to render as an empty day, indistinguishable
          // from a day with no sales.
          <p
            role="alert"
            className="py-10 text-center text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        ) : (
          <ListClosedSales
            closedSales={visibleSales}
            // revertSale invalidates the ["closedSales"] prefix, so the day on
            // screen refetches itself — no need to re-request it by hand.
            revertSale={revertSale}
            // Same invalidation, so the named row refetches itself too.
            updateClosedSale={updateClosedSale}
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
