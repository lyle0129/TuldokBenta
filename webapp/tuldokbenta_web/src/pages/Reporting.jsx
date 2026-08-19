// pages/Reporting.jsx
import { useMemo, useState } from "react";
import { Banknote, Clock, FileText, Diamond } from "lucide-react";
import { useOpenSales, useClosedSalesInRange } from "../hooks/useSales";
import { useReportAnalytics } from "../hooks/useReportAnalytics";
import ReportToolbar from "../components/reporting/ReportToolbar";
import ReportSalesList from "../components/reporting/ReportSalesList";
import StatTile from "../components/reporting/StatTile";
import BreakdownPanel from "../components/reporting/BreakdownPanel";
import RevenueTrendChart from "../components/charts/RevenueTrendChart";
import SalesVolumeChart from "../components/charts/SalesVolumeChart";
import PaymentBreakdownChart from "../components/charts/PaymentBreakdownChart";
import ItemSalesChart from "../components/charts/ItemSalesChart";
import { filterSales } from "../utils/filterSales";
import { formatCurrency } from "../utils/format";
import { localRangeBounds, presetRange } from "../utils/dateRange";

const GRANULARITIES = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

const initialFilters = () => ({
  preset: "today",
  ...presetRange("today"),
  query: "",
  paymentMethod: "all",
  lineType: "all",
});

/**
 * The sales report.
 *
 * One rule runs the whole page: **open sales are dated by created_at, closed
 * sales by paid_at**. That is the model the database already uses — paying a
 * sale moves the row into closed_sales and stamps paid_at — but the old page
 * filtered closed sales on created_at, so a sale opened Monday and paid Tuesday
 * counted as Monday revenue even though no money moved that day.
 *
 * It produces two headline totals that overlap on purpose and must never be
 * added together:
 *   collected — paid in this range. The cash that arrived.
 *   booked    — created in this range. The business written.
 *
 * That also disposes of the old "Previous Days Paid Today" card: a sale paid
 * today is simply part of today's collected, wherever it was opened.
 */
const Reporting = () => {
  const [filters, setFilters] = useState(initialFilters);
  const [granularity, setGranularity] = useState("daily");

  const { from, to } = filters;

  // Three reads, because the two questions need different slices of the same
  // table and the browser is no longer the place to cut them.
  const {
    closedSales: collectedRaw,
    isLoading: collectedLoading,
    error: collectedError,
  } = useClosedSalesInRange(from, to, "paid_at");

  const {
    closedSales: bookedClosedRaw,
    isLoading: bookedLoading,
    error: bookedError,
  } = useClosedSalesInRange(from, to, "created_at");

  // Unbounded on purpose: open_sales only holds unpaid rows, and paying drains
  // it. This is the outstanding balance, which has no date to be filtered by.
  const {
    openSales,
    isLoading: openLoading,
    error: openError,
  } = useOpenSales();

  const isLoading = collectedLoading || bookedLoading || openLoading;
  const error = collectedError || bookedError || openError;

  /** Search, payment method and line type — everything except the dates. */
  const applyFilters = useMemo(() => {
    const { query, paymentMethod, lineType } = filters;
    return (sales) => {
      let result = filterSales(sales, query);

      if (paymentMethod !== "all") {
        result = result.filter((sale) => sale.paid_using === paymentMethod);
      }
      if (lineType !== "all") {
        result = result.filter((sale) =>
          (sale.items || []).some((item) => item.type === lineType)
        );
      }
      return result;
    };
  }, [filters]);

  const collected = useMemo(
    () => applyFilters(collectedRaw),
    [applyFilters, collectedRaw]
  );

  const outstanding = useMemo(
    () => applyFilters(openSales),
    [applyFilters, openSales]
  );

  /**
   * Everything created in the range, paid or not.
   *
   * The open half is cut here rather than by the server: the whole unpaid list
   * is already loaded for the outstanding figure, so a fourth request would buy
   * nothing.
   */
  const booked = useMemo(() => {
    // The same window the server was given for the closed half — both sides of
    // `booked` have to agree on where the day starts, and the shop's midnight
    // is eight hours off the UTC the timestamps are stored in.
    const { start, end } = localRangeBounds(from, to);
    const openedInRange = outstanding.filter((sale) => {
      const created = new Date(sale.created_at);
      return created >= start && created <= end;
    });
    return [...applyFilters(bookedClosedRaw), ...openedInRange];
  }, [applyFilters, bookedClosedRaw, outstanding, from, to]);

  const analytics = useReportAnalytics({
    collected,
    booked,
    outstanding,
    granularity,
  });

  const tabClass = (active) =>
    `px-4 min-h-11 rounded-md border text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
      active
        ? "bg-blue-600 border-blue-600 text-white"
        : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
    }`;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-5 text-gray-800 dark:text-gray-100">
        Reporting
      </h1>

      <ReportToolbar
        value={filters}
        onChange={setFilters}
        onReset={() => setFilters(initialFilters())}
        sales={collectedRaw}
        summary={`${analytics.collected.count} paid · ${formatCurrency(
          analytics.collected.total
        )} collected`}
      />

      {isLoading ? (
        <p className="py-10 text-center text-gray-500 dark:text-gray-400 animate-pulse">
          Loading sales…
        </p>
      ) : error ? (
        // A failed load used to render a dashboard of zeroes, which reads as
        // "no sales" rather than "the data never arrived".
        <p
          role="alert"
          className="py-10 text-center text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      ) : (
        <div className="space-y-6">
          {/* Each tile names its own rule: collected and booked overlap, so
              without the captions they read as two halves of a sum. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              label="Collected"
              value={formatCurrency(analytics.collected.total)}
              sub={`${analytics.collected.count} paid`}
              hint="Sales paid in this range"
              icon={Banknote}
              accent="green"
            />
            <StatTile
              label="Outstanding"
              value={formatCurrency(analytics.outstanding.total)}
              sub={`${analytics.outstanding.count} unpaid`}
              hint="Every open sale, all time"
              icon={Clock}
              accent="amber"
            />
            <StatTile
              label="Booked"
              value={formatCurrency(analytics.booked.total)}
              sub={`${analytics.booked.count} opened`}
              hint="Sales created in this range"
              icon={FileText}
              accent="blue"
            />
            <StatTile
              label="Average sale"
              value={formatCurrency(analytics.collected.average)}
              sub={`over ${analytics.collected.count} payments`}
              hint="Collected ÷ payments"
              icon={Diamond}
              accent="indigo"
            />
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 transition-colors">
            <div
              role="tablist"
              aria-label="Chart granularity"
              className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1"
            >
              {GRANULARITIES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={granularity === option.id}
                  onClick={() => setGranularity(option.id)}
                  className={tabClass(granularity === option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <RevenueTrendChart
            chartData={analytics.trend}
            granularity={granularity}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SalesVolumeChart
              chartData={analytics.trend}
              granularity={granularity}
            />
            <ItemSalesChart items={analytics.lines.items} />
          </div>

          <PaymentBreakdownChart paymentMethodBreakdown={analytics.payments} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BreakdownPanel
              title="Services sold"
              rows={analytics.lines.services}
              columns={[
                { key: "name", label: "Service" },
                { key: "qty", label: "Qty", align: "center", total: true },
                {
                  key: "total",
                  label: "Revenue",
                  align: "right",
                  money: true,
                  total: true,
                },
              ]}
              emptyMessage="No services in this range."
            />

            <BreakdownPanel
              title="Item categories"
              rows={analytics.lines.itemGroups}
              columns={[
                { key: "category", label: "Category" },
                { key: "qty", label: "Units", align: "center", total: true },
                {
                  key: "total",
                  label: "Revenue",
                  align: "right",
                  money: true,
                  total: true,
                },
              ]}
              emptyMessage="No items in this range."
            />
          </div>

          <BreakdownPanel
            title="Items used"
            rows={analytics.lines.items}
            columns={[
              { key: "name", label: "Item" },
              { key: "qty", label: "Units", align: "center", total: true },
              {
                key: "total",
                label: "Revenue",
                align: "right",
                money: true,
                total: true,
              },
            ]}
            emptyMessage="No items in this range."
            limit={15}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ReportSalesList
              title="Closed — paid in this range"
              sales={collected}
              showPayment
              emptyMessage={
                collectedRaw.length === 0
                  ? "Nothing was paid in this range."
                  : "No payments match the current filters."
              }
            />
            <ReportSalesList
              title="Open — still unpaid"
              sales={outstanding}
              emptyMessage={
                openSales.length === 0
                  ? "No open sales. Everything is paid."
                  : "No open sales match the current filters."
              }
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Reporting;
