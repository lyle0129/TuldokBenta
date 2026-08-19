// components/reporting/BreakdownPanel.jsx
import { formatCurrency } from "../../utils/format";

/**
 * One table of "what sold", parameterized by its columns.
 *
 * The old summaries carried three near-identical copies of this markup — one
 * per breakdown — each with its own totals row to keep in step.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {object[]} props.rows
 * @param {{key: string, label: string, align?: "left"|"center"|"right",
 *          money?: boolean, total?: boolean}[]} props.columns
 *        `total` marks a column to sum in the footer; `money` formats as pesos.
 * @param {string} props.emptyMessage
 * @param {number} [props.limit] show at most this many rows
 */
const BreakdownPanel = ({
  title,
  rows = [],
  columns,
  emptyMessage,
  limit,
}) => {
  const visible = limit ? rows.slice(0, limit) : rows;
  const hidden = rows.length - visible.length;

  const alignClass = (align) =>
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  const render = (row, column) => {
    const value = row[column.key];
    return column.money ? formatCurrency(value) : value;
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 transition-colors">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
        {title}
      </h3>

      {visible.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center italic py-8">
          {emptyMessage}
        </p>
      ) : (
        // Wide tables scroll inside the panel rather than pushing the page wide.
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`py-2 px-2 font-semibold text-gray-800 dark:text-gray-100 ${alignClass(column.align)}`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {visible.map((row, index) => (
                <tr
                  key={row.name ?? row.category ?? index}
                  className="border-b border-gray-100 dark:border-gray-700/60"
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`py-2 px-2 text-gray-700 dark:text-gray-300 ${alignClass(column.align)}`}
                    >
                      {render(row, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="border-t-2 border-gray-300 dark:border-gray-600">
                {columns.map((column, index) => {
                  if (index === 0) {
                    return (
                      <td
                        key={column.key}
                        className="py-2 px-2 font-bold text-gray-800 dark:text-gray-100"
                      >
                        Total
                      </td>
                    );
                  }
                  if (!column.total) {
                    return <td key={column.key} className="py-2 px-2" />;
                  }
                  // Sums every row, not just the visible ones — a footer that
                  // only added up the top 10 would contradict the KPI tiles.
                  const sum = rows.reduce(
                    (acc, row) => acc + Number(row[column.key] || 0),
                    0
                  );
                  return (
                    <td
                      key={column.key}
                      className={`py-2 px-2 font-bold text-gray-800 dark:text-gray-100 ${alignClass(column.align)}`}
                    >
                      {column.money ? formatCurrency(sum) : sum}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {hidden > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          Showing the top {visible.length} of {rows.length}; the total above
          covers all {rows.length}.
        </p>
      )}
    </div>
  );
};

export default BreakdownPanel;
