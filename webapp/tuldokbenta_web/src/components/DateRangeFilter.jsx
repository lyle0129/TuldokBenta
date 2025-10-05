import { useState, useMemo } from "react";

export default function DateRangeFilter({ onApply, onReset }) {
  const [lowDate, setLowDate] = useState("");
  const [highDate, setHighDate] = useState("");
  const [appliedLow, setAppliedLow] = useState("");
  const [appliedHigh, setAppliedHigh] = useState("");
  const [showAlert, setShowAlert] = useState(false);

  const handleApply = () => {
    if (!lowDate || !highDate) {
      setShowAlert(true);
      return;
    }
    setAppliedLow(lowDate);
    setAppliedHigh(highDate);
    onApply(lowDate, highDate);
  };

  const displayRange = useMemo(() => {
    if (!appliedLow || !appliedHigh) return "Showing all dates";
    const start = new Date(appliedLow).toLocaleDateString();
    const end = new Date(appliedHigh).toLocaleDateString();
    return `Showing from ${start} to ${end}`;
  }, [appliedLow, appliedHigh]);

  return (
    <div className="date-filter flex flex-wrap items-end gap-4 mb-4 sticky top-0 bg-gray-50 dark:bg-gray-900 p-4 z-10 shadow">
      <div>
        <label>
          From:{" "}
          <input
            type="date"
            value={lowDate}
            onChange={(e) => setLowDate(e.target.value)}
            className="mt-1 block w-40 rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
      </div>
      <div>
        <label>
          To:{" "}
          <input
            type="date"
            value={highDate}
            onChange={(e) => setHighDate(e.target.value)}
            className="mt-1 block w-40 rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleApply}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
        >
          Apply
        </button>
        <button
          onClick={() => {
            setLowDate("");
            setHighDate("");
            setAppliedLow("");
            setAppliedHigh("");
            onReset();
          }}
          className="px-4 py-2 rounded-lg bg-gray-300 text-gray-800 font-semibold hover:bg-gray-400 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition"
        >
          Reset
        </button>
      </div>

      {/* Display current range */}
      <p className="w-full mt-2 text-gray-700 dark:text-gray-300">{displayRange}</p>

      {/* Modal Alert */}
      {showAlert && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-80 text-center">
            <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              Please select both start and end dates.
            </p>
            <button
              onClick={() => setShowAlert(false)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
