// components/closed-sales/DayPicker.jsx
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftDay, todayISODate } from "../../utils/dateRange";
import { formatDayLabel } from "../../utils/format";

/**
 * Steps the closed-sales view one day at a time.
 *
 * A native `<input type="date">` is deliberate: on a phone it opens the OS
 * date wheel, which beats anything hand-rolled. It's kept small and paired
 * with arrows because stepping to "yesterday" is the common case.
 *
 * @param {string} value      selected day, "YYYY-MM-DD"
 * @param {(d: string) => void} onChange
 */
const DayPicker = ({ value, onChange }) => {
  const today = todayISODate();
  const isToday = value === today;

  const arrowClass =
    "w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(shiftDay(value, -1))}
          aria-label="Previous day"
          className={arrowClass}
        >
          <ChevronLeft size={20} />
        </button>

        <span className="flex-1 text-center font-semibold text-gray-800 dark:text-gray-100 min-w-[10rem]">
          {formatDayLabel(value)}
        </span>

        <button
          type="button"
          onClick={() => onChange(shiftDay(value, 1))}
          // There are no sales in the future, so stop the day walking past today.
          disabled={isToday}
          aria-label="Next day"
          className={arrowClass}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="flex items-center gap-2 sm:ml-auto">
        <input
          type="date"
          value={value}
          max={today}
          aria-label="Pick a date"
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="min-h-11 flex-1 sm:flex-none rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-3 focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
        />
        <button
          type="button"
          onClick={() => onChange(today)}
          disabled={isToday}
          className="px-4 min-h-11 flex-shrink-0 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          Today
        </button>
      </div>
    </div>
  );
};

export default DayPicker;
