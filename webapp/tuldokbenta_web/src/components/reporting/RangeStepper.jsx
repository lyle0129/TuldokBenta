// components/reporting/RangeStepper.jsx
import { ChevronLeft, ChevronRight } from "lucide-react";
import { todayISODate } from "../../utils/dateRange";
import { formatRangeLabel } from "../../utils/format";

/**
 * Walks the report's date range backwards and forwards a day at a time.
 *
 * The same gesture the closed-sales day picker offers, generalised to a pair of
 * dates: reading yesterday's report used to mean typing both the From and the
 * To field. The whole window moves, so a one-day range steps day by day while a
 * longer one slides without changing width.
 *
 * @param {object} props
 * @param {string} props.from "YYYY-MM-DD", inclusive
 * @param {string} props.to   "YYYY-MM-DD", inclusive
 * @param {(days: number) => void} props.onStep
 */
const RangeStepper = ({ from, to, onStep }) => {
  const today = todayISODate();
  // ISO dates compare correctly as strings, and `to` can only exceed today if
  // it was typed by hand.
  const atToday = to >= today;

  // Whole days, inclusive of both ends. Rounded because a DST transition makes
  // the raw difference 23 or 25 hours.
  const spanDays =
    Math.round(
      (new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86_400_000
    ) + 1;

  const arrowClass =
    "w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onStep(-1)}
        aria-label="Previous day"
        className={arrowClass}
      >
        <ChevronLeft size={20} />
      </button>

      <div className="flex-1 text-center min-w-0">
        <span className="block font-semibold text-gray-800 dark:text-gray-100 truncate">
          {formatRangeLabel(from, to)}
        </span>
        {Number.isFinite(spanDays) && spanDays > 1 && (
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            {spanDays} days
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => onStep(1)}
        // There are no sales in the future, so the window stops at today.
        disabled={atToday}
        aria-label="Next day"
        className={arrowClass}
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
};

export default RangeStepper;
