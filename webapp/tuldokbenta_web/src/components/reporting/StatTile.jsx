// components/reporting/StatTile.jsx

/**
 * One KPI. Replaces about ten hand-copied tile blocks across the old summaries.
 *
 * `hint` is not decoration: collected and booked overlap on purpose, so each
 * tile has to say which rule produced its number or the two read as addends.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.value    already formatted
 * @param {string} [props.sub]    secondary figure, e.g. "30 paid"
 * @param {string} [props.hint]   the attribution rule, e.g. "paid in this range"
 * @param {{label: string, value: string, sub?: string}[]} [props.breakdown]
 *        Parts of the headline, shown beneath it. They must sum to `value` —
 *        this is a decomposition, not a list of related numbers.
 * @param {React.ComponentType} [props.icon]
 * @param {"blue"|"green"|"amber"|"indigo"} [props.accent]
 */
const ACCENTS = {
  blue: {
    value: "text-blue-700 dark:text-blue-400",
    chip: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  },
  green: {
    value: "text-green-700 dark:text-green-400",
    chip: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
  },
  amber: {
    value: "text-amber-700 dark:text-amber-400",
    chip: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  },
  indigo: {
    value: "text-indigo-700 dark:text-indigo-400",
    chip: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300",
  },
};

const StatTile = ({
  label,
  value,
  sub,
  hint,
  breakdown,
  icon: Icon,
  accent = "blue",
}) => {
  const colors = ACCENTS[accent] ?? ACCENTS.blue;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-5 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {label}
          </p>
          <p className={`text-2xl font-bold mt-1 break-words ${colors.value}`}>
            {value}
          </p>
          {sub && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {sub}
            </p>
          )}
        </div>

        {Icon && (
          <span
            className={`w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center ${colors.chip}`}
          >
            <Icon size={22} aria-hidden="true" />
          </span>
        )}
      </div>

      {breakdown?.length > 0 && (
        <dl className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-1.5">
          {breakdown.map((part) => (
            <div
              key={part.label}
              className="flex items-baseline justify-between gap-3"
            >
              <dt className="text-xs text-gray-600 dark:text-gray-400 min-w-0">
                {part.label}
              </dt>
              <dd className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex-shrink-0 tabular-nums">
                {part.value}
                {part.sub && (
                  <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400">
                    {part.sub}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {hint && (
        <p
          className={`text-xs text-gray-500 dark:text-gray-400 mt-3 ${
            breakdown?.length > 0
              ? ""
              : "pt-3 border-t border-gray-200 dark:border-gray-700"
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
};

export default StatTile;
