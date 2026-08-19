// hooks/useReportAnalytics.js
import { useMemo } from "react";
import {
  isPaidAsOf,
  lineBreakdown,
  outstandingAsOf,
  paymentBreakdown,
  splitBy,
  summarize,
  trendSeries,
} from "../utils/reportMetrics";
import { localRangeBounds } from "../utils/dateRange";

/**
 * Every figure on the report, derived from one window of closed sales plus the
 * open ones.
 *
 * The hook takes raw sales and a range rather than pre-sliced lists, because
 * the slices are not independent: collected, booked and outstanding are three
 * questions about the same set, and cutting them apart at the call site is how
 * they previously drifted into disagreeing.
 *
 * Everything settlement-related is asked **as of the range's end**, never "now".
 * That is what makes a past range's numbers stable: paying an old sale today
 * must not change what last Tuesday's report says was owed last Tuesday.
 *
 * @param {object}   params
 * @param {object[]} params.windowSales closed sales in the window
 *                                      (created <= end, paid >= start)
 * @param {object[]} params.openSales   every unpaid sale
 * @param {string}   params.from        "YYYY-MM-DD"
 * @param {string}   params.to          "YYYY-MM-DD"
 * @param {string}   params.granularity daily | weekly | monthly | yearly
 */
export function useReportAnalytics({
  windowSales = [],
  openSales = [],
  from,
  to,
  granularity = "daily",
}) {
  return useMemo(() => {
    const { start, end } = localRangeBounds(from, to);
    const createdAt = (sale) => new Date(sale.created_at);

    // Anything that could still be owed on some day in the range. Open sales
    // are unpaid by definition; the window holds those paid after it began.
    const owedSource = [...windowSales, ...openSales];

    // ---- Collected: money that actually arrived inside the range ----------
    const collected = windowSales.filter(
      (sale) => new Date(sale.paid_at) <= end
    );
    // Against bookings made in this range, vs. collecting on the backlog.
    const collectedSplit = splitBy(collected, (sale) => createdAt(sale) >= start);

    // ---- Booked: business written inside the range, settled or not -------
    const booked = [
      ...windowSales.filter((sale) => createdAt(sale) >= start),
      ...openSales.filter(
        (sale) => createdAt(sale) >= start && createdAt(sale) <= end
      ),
    ];
    const bookedSplit = splitBy(booked, (sale) => isPaidAsOf(sale, end));

    // ---- Outstanding: what was owed when the range closed ----------------
    const outstanding = outstandingAsOf(owedSource, end);

    // ---- Carried over: owed *before* the range even started --------------
    // The population behind Collected's "earlier bookings" line, so the card
    // and the list can be reconciled against each other.
    const carriedOver = outstandingAsOf(owedSource, start);
    const carriedSplit = splitBy(carriedOver, (sale) => isPaidAsOf(sale, end));

    return {
      collected: {
        ...summarize(collected),
        sales: collected,
        thisRange: summarize(collectedSplit.yes),
        earlier: summarize(collectedSplit.no),
      },
      booked: {
        ...summarize(booked),
        sales: booked,
        paid: summarize(bookedSplit.yes),
        unpaid: summarize(bookedSplit.no),
      },
      outstanding: { ...summarize(outstanding), sales: outstanding },
      carriedOver: {
        ...summarize(carriedOver),
        sales: carriedOver,
        paidInRange: summarize(carriedSplit.yes),
        stillOwed: summarize(carriedSplit.no),
      },
      rangeEnd: end,
      payments: paymentBreakdown(collected),
      // Keyed to what was collected: these sit under the revenue charts, and
      // mixing in unpaid lines would inflate them past the money.
      lines: lineBreakdown(collected),
      trend: trendSeries({
        collected,
        booked,
        owedSource,
        from,
        to,
        granularity,
      }),
    };
  }, [windowSales, openSales, from, to, granularity]);
}
