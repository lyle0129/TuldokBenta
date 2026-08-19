// pages/Reporting.jsx
import { useMemo, useState } from "react";
import { Banknote, Clock, FileText } from "lucide-react";
import { useOpenSales, useClosedSalesWindow } from "../hooks/useSales";
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
import { formatCurrency, formatDayLabel } from "../utils/format";
import { presetRange } from "../utils/dateRange";
import { isPaidAsOf } from "../utils/reportMetrics";

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
 * Two rules run the whole page.
 *
 * **Dating.** Open sales are dated by created_at, closed sales by paid_at —
 * the model the database already uses, since paying a sale moves the row into
 * closed_sales and stamps paid_at. Collected is money that arrived in the
 * range; booked is business written in it. They overlap by design and are
 * never summed.
 *
 * **Settlement is asked as of the range's end, never "now".** A sale opened on
 * the 15th and paid on the 20th *was* owed on the 15th, so the 15th's report
 * says so — today, and next year. Asking "is it unpaid right now" would make
 * every historical report drift as old debts get settled, which is a worse
 * failure than being wrong: nothing looks broken.
 */
const Reporting = () => {
  const [filters, setFilters] = useState(initialFilters);
  const [granularity, setGranularity] = useState("daily");

  const { from, to } = filters;

  // One window covers every question: everything created by `to` that was
  // still unpaid when `from` began. See useClosedSalesWindow.
  const {
    closedSales: windowRaw,
    isLoading: windowLoading,
    error: windowError,
  } = useClosedSalesWindow(from, to);

  // Unbounded on purpose: open_sales only holds unpaid rows, and paying drains
  // it. Needed in full because a sale opened long before the range can still
  // be owed inside it.
  const {
    openSales,
    isLoading: openLoading,
    error: openError,
  } = useOpenSales();

  const isLoading = windowLoading || openLoading;
  const error = windowError || openError;

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

  const windowSales = useMemo(
    () => applyFilters(windowRaw),
    [applyFilters, windowRaw]
  );

  // The payment-method filter would empty this entirely — an unpaid sale has no
  // method — so it only ever sees the text and line-type filters.
  const visibleOpenSales = useMemo(
    () => filterSales(openSales, filters.query),
    [openSales, filters.query]
  );

  const analytics = useReportAnalytics({
    windowSales,
    openSales: visibleOpenSales,
    from,
    to,
    granularity,
  });

  const { rangeEnd } = analytics;
  const asOfLabel = `as of ${formatDayLabel(to)}`;

  const tabClass = (active) =>
    `px-4 min-h-11 rounded-md border text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
      active
        ? "bg-blue-600 border-blue-600 text-white"
        : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
    }`;

  const countOf = (part) => `(${part.count})`;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-5 text-gray-800 dark:text-gray-100">
        Reporting
      </h1>

      <ReportToolbar
        value={filters}
        onChange={setFilters}
        onReset={() => setFilters(initialFilters())}
        sales={windowRaw}
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
          {/* Each tile names the rule that produced it. Collected and booked
              overlap, so without the captions they read as two halves of a
              sum; outstanding is a moment, not a period. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatTile
              label="Collected"
              value={formatCurrency(analytics.collected.total)}
              sub={`${analytics.collected.count} payments`}
              icon={Banknote}
              accent="green"
              breakdown={[
                {
                  label: "from this range's bookings",
                  value: formatCurrency(analytics.collected.thisRange.total),
                  sub: countOf(analytics.collected.thisRange),
                },
                {
                  label: "from earlier bookings",
                  value: formatCurrency(analytics.collected.earlier.total),
                  sub: countOf(analytics.collected.earlier),
                },
              ]}
              hint="Money that arrived in this range"
            />

            <StatTile
              label="Booked"
              value={formatCurrency(analytics.booked.total)}
              sub={`${analytics.booked.count} opened`}
              icon={FileText}
              accent="blue"
              breakdown={[
                {
                  label: "paid",
                  value: formatCurrency(analytics.booked.paid.total),
                  sub: countOf(analytics.booked.paid),
                },
                {
                  label: "still unpaid",
                  value: formatCurrency(analytics.booked.unpaid.total),
                  sub: countOf(analytics.booked.unpaid),
                },
              ]}
              hint={`Business written in this range · settled ${asOfLabel}`}
            />

            <StatTile
              label="Outstanding"
              value={formatCurrency(analytics.outstanding.total)}
              sub={`${analytics.outstanding.count} unpaid`}
              icon={Clock}
              accent="amber"
              breakdown={[
                {
                  label: "carried in, still owed",
                  value: formatCurrency(analytics.carriedOver.stillOwed.total),
                  sub: countOf(analytics.carriedOver.stillOwed),
                },
                {
                  label: "opened in range, unpaid",
                  value: formatCurrency(analytics.booked.unpaid.total),
                  sub: countOf(analytics.booked.unpaid),
                },
              ]}
              hint={`Owed ${asOfLabel} — not "unpaid right now"`}
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

          <ReportSalesList
            title="Booked in this range"
            sales={analytics.booked.sales}
            asOf={rangeEnd}
            filters={[
              { id: "all", label: "All" },
              {
                id: "paid",
                label: "Paid",
                test: (sale, asOf) => isPaidAsOf(sale, asOf),
              },
              {
                id: "unpaid",
                label: "Unpaid",
                test: (sale, asOf) => !isPaidAsOf(sale, asOf),
              },
            ]}
            emptyMessage="Nothing was booked in this range."
            noMatchMessage="No bookings match this filter."
          />

          {/* The population behind Collected's "from earlier bookings" line:
              filter this to "Paid in range" and the two must agree. */}
          <ReportSalesList
            title="Carried over from before this range"
            sales={analytics.carriedOver.sales}
            asOf={rangeEnd}
            filters={[
              { id: "all", label: "All" },
              {
                id: "paid",
                label: "Paid in range",
                test: (sale, asOf) => isPaidAsOf(sale, asOf),
              },
              {
                id: "owed",
                label: "Still owed",
                test: (sale, asOf) => !isPaidAsOf(sale, asOf),
              },
            ]}
            emptyMessage="Nothing was owed when this range began."
            noMatchMessage="No carried-over sales match this filter."
          />
        </div>
      )}
    </div>
  );
};

export default Reporting;
