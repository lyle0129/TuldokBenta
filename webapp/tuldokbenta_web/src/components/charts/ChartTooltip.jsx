// components/charts/ChartTooltip.jsx
import { formatCurrency } from "../../utils/format";

/**
 * The tooltip every chart uses.
 *
 * Recharts' `contentStyle` takes literal CSS, so the shared style the charts
 * used to inline was a hardcoded light panel — unreadable once the app was in
 * dark mode. Rendering our own content instead lets Tailwind's `dark:` variants
 * do the work, the same way the rest of the app handles it.
 *
 * Pass as `<Tooltip content={<ChartTooltip money />} />`.
 *
 * @param {object} props
 * @param {boolean} [props.money] format values as pesos
 */
const ChartTooltip = ({ active, payload, label, money = false }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 shadow-md">
      {label != null && (
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 mb-1">
          {label}
        </p>
      )}
      <ul className="space-y-0.5">
        {payload.map((entry, index) => (
          <li
            key={`${entry.dataKey ?? entry.name}-${index}`}
            className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300"
          >
            <span
              aria-hidden="true"
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color ?? entry.payload?.fill }}
            />
            <span>{entry.name}</span>
            <span className="ml-auto font-semibold text-gray-900 dark:text-gray-100">
              {money ? formatCurrency(entry.value) : entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ChartTooltip;
