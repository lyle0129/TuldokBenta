// components/reporting/ReportToolbar.jsx
import { useMemo } from "react";
import { X } from "lucide-react";
import SearchInput from "../shared/SearchInput";
import RangeStepper from "./RangeStepper";
import { usePaymentMethods } from "../../hooks/usePaymentMethods";
import { buildMethodLookup, resolveMethod } from "../../utils/paymentMethods";
import {
  RANGE_PRESETS,
  matchPreset,
  presetRange,
  shiftRange,
  todayISODate,
} from "../../utils/dateRange";
import { inputClass, labelClass } from "../shared/fieldStyles";

/**
 * The report's single set of controls.
 *
 * Fully controlled: every value comes from the page and every change goes back
 * to it. The panel it replaces kept a second copy of the filters in its own
 * state, so remounting it — which the old tab switch did on every click — blanked
 * the visible controls while the page stayed filtered.
 *
 * @param {object} props
 * @param {{preset: string, from: string, to: string, query: string,
 *          paymentMethod: string, lineType: string}} props.value
 * @param {(next: object) => void} props.onChange
 * @param {() => void} props.onReset
 * @param {object[]} [props.sales] the sales in scope, read only to keep a
 *                                 deleted method's code selectable
 * @param {string} [props.summary] the "24 paid · ₱12,450 collected" line
 */
const ReportToolbar = ({ value, onChange, onReset, sales = [], summary }) => {
  const today = todayISODate();
  const { paymentMethods } = usePaymentMethods();

  const methodLookup = useMemo(
    () => buildMethodLookup(paymentMethods),
    [paymentMethods]
  );

  /**
   * Configured methods in the admin's own order, then any code still present
   * in the data that no longer has a row — so a deleted method's sales stay
   * filterable instead of being stranded.
   */
  const methodOptions = useMemo(() => {
    const configured = paymentMethods.map((m) => ({
      code: m.code,
      label: m.label,
    }));
    const known = new Set(configured.map((o) => o.code));

    const orphaned = [...new Set(sales.map((s) => s.paid_using).filter(Boolean))]
      .filter((code) => !known.has(code))
      .sort()
      .map((code) => ({ code, label: resolveMethod(methodLookup, code).label }));

    return [...configured, ...orphaned];
  }, [paymentMethods, sales, methodLookup]);

  const set = (patch) => onChange({ ...value, ...patch });

  // Picking a preset writes concrete dates, so everything downstream reads
  // from `from`/`to` alone and never has to re-derive what "7d" meant.
  const applyPreset = (id) => set({ preset: id, ...presetRange(id) });

  // Typing a date by hand is what "custom" means; there is no separate button.
  const setDate = (key, date) => set({ preset: "custom", [key]: date });

  // Stepping keeps the tab strip honest: walk a day back off "Today" and the
  // range is custom, walk forward onto it again and the Today tab lights up.
  const stepRange = (days) => {
    const next = shiftRange(value.from, value.to, days);
    set({ ...next, preset: matchPreset(next.from, next.to) });
  };

  const tabClass = (active) =>
    `px-4 min-h-11 rounded-md border text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
      active
        ? "bg-blue-600 border-blue-600 text-white"
        : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
    }`;

  const chipClass =
    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-700";

  const chips = [];
  if (value.query) chips.push(`Search: “${value.query}”`);
  if (value.paymentMethod !== "all") {
    // The label, not the raw code — the old chip printed the slug.
    chips.push(`Payment: ${resolveMethod(methodLookup, value.paymentMethod).label}`);
  }
  if (value.lineType !== "all") {
    chips.push(value.lineType === "service" ? "Services only" : "Items only");
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 mb-6 transition-colors space-y-4">
      <div
        role="tablist"
        aria-label="Report date range"
        className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1"
      >
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="tab"
            aria-selected={value.preset === preset.id}
            onClick={() => applyPreset(preset.id)}
            className={tabClass(value.preset === preset.id)}
          >
            {preset.label}
          </button>
        ))}
        <span
          role="tab"
          aria-selected={value.preset === "custom"}
          className={`${tabClass(value.preset === "custom")} cursor-default flex items-center`}
        >
          Custom
        </span>
      </div>

      <RangeStepper from={value.from} to={value.to} onStep={stepRange} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className={labelClass} htmlFor="report-from">
            From
          </label>
          <input
            id="report-from"
            type="date"
            value={value.from}
            // There are no sales in the future.
            max={value.to || today}
            onChange={(e) => e.target.value && setDate("from", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="report-to">
            To
          </label>
          <input
            id="report-to"
            type="date"
            value={value.to}
            min={value.from}
            max={today}
            onChange={(e) => e.target.value && setDate("to", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="report-payment">
            Payment method
          </label>
          <select
            id="report-payment"
            value={value.paymentMethod}
            onChange={(e) => set({ paymentMethod: e.target.value })}
            className={inputClass}
          >
            <option value="all">All methods</option>
            {methodOptions.map(({ code, label }) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="report-type">
            Contains
          </label>
          <select
            id="report-type"
            value={value.lineType}
            onChange={(e) => set({ lineType: e.target.value })}
            className={inputClass}
          >
            <option value="all">Anything</option>
            <option value="service">Services only</option>
            <option value="item">Items only</option>
          </select>
        </div>
      </div>

      <SearchInput
        value={value.query}
        onChange={(query) => set({ query })}
        placeholder="Search invoice, customer, item, or payment…"
        ariaLabel="Search sales"
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1 border-t border-gray-200 dark:border-gray-700">
        {summary && (
          <p className="text-sm text-gray-600 dark:text-gray-400 pt-3">
            {summary}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:pt-3">
          {chips.map((chip) => (
            <span key={chip} className={chipClass}>
              {chip}
            </span>
          ))}
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 px-4 min-h-11 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium transition-colors"
          >
            <X size={16} aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportToolbar;
