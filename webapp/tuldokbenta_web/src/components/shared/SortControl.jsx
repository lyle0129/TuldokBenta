// components/shared/SortControl.jsx
import { ChevronUp, ChevronDown } from "lucide-react";
import { labelClass, inputClass } from "./fieldStyles";

/**
 * Field picker plus a direction toggle.
 *
 * Every list in this app renders cards, so there are no column headers to click
 * and sorting has to be its own control. The direction button is separate from
 * the field select rather than folded into it as "Name A–Z / Name Z–A" pairs:
 * that doubles the options and makes changing field lose the direction.
 *
 * The arrow always points the way the list is currently ordered.
 */
const SortControl = ({ fields, sortBy, sortOrder, onChange, idPrefix }) => {
  const selectId = `${idPrefix}-sort-field`;
  const ascending = sortOrder === "asc";
  const activeLabel =
    fields.find((f) => f.value === sortBy)?.label ?? "the selected field";

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 min-w-0">
        <label className={labelClass} htmlFor={selectId}>
          Sort by
        </label>
        <select
          id={selectId}
          value={sortBy}
          onChange={(e) => onChange(e.target.value, sortOrder)}
          className={inputClass}
        >
          {fields.map((field) => (
            <option key={field.value} value={field.value}>
              {field.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={() => onChange(sortBy, ascending ? "desc" : "asc")}
        aria-pressed={!ascending}
        aria-label={`Sort ${activeLabel} ${
          ascending ? "descending" : "ascending"
        }`}
        title={ascending ? "Ascending" : "Descending"}
        className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        {ascending ? (
          <ChevronUp size={20} aria-hidden="true" />
        ) : (
          <ChevronDown size={20} aria-hidden="true" />
        )}
      </button>
    </div>
  );
};

export default SortControl;
