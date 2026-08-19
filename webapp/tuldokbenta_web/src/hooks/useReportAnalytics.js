// hooks/useReportAnalytics.js
import { useMemo } from "react";
import {
  lineBreakdown,
  paymentBreakdown,
  summarize,
  trendSeries,
} from "../utils/reportMetrics";

/**
 * Memoizes the report's arithmetic. All of it lives in utils/reportMetrics,
 * which is where the attribution rule is documented and tested.
 *
 * The caller passes three already-scoped lists rather than one pile plus a
 * filter, so this hook has no opinion about which date a sale belongs to — the
 * queries decided that, and there is nowhere left for the old "created or paid,
 * whichever matches" fallback to creep back in.
 *
 * @param {object}   params
 * @param {object[]} params.collected   closed sales *paid* in the range
 * @param {object[]} params.booked      any sale *created* in the range
 * @param {object[]} params.outstanding open (unpaid) sales, undated
 * @param {string}   params.granularity daily | weekly | monthly | yearly
 */
export function useReportAnalytics({
  collected = [],
  booked = [],
  outstanding = [],
  granularity = "daily",
}) {
  return useMemo(
    () => ({
      collected: summarize(collected),
      booked: summarize(booked),
      outstanding: summarize(outstanding),
      payments: paymentBreakdown(collected),
      // Keyed to what was collected: these breakdowns sit under the revenue
      // charts, and mixing in unpaid lines would inflate them past the money.
      lines: lineBreakdown(collected),
      trend: trendSeries({ collected, booked, granularity }),
    }),
    [collected, booked, outstanding, granularity]
  );
}
