// src/components/DateRangeFilter.jsx
import { useState } from "react";

export default function DateRangeFilter({ onApply, onReset }) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const formattedToday = `${yyyy}-${mm}-${dd}`;

  const [lowDate, setLowDate] = useState(formattedToday);
  const [highDate, setHighDate] = useState(formattedToday);
  const [showAlert, setShowAlert] = useState(false);

  const handleApply = () => {
    if (!lowDate || !highDate) {
      setShowAlert(true);
      return;
    }
    onApply(lowDate, highDate);
  };

  const handleToday = () => {
    setLowDate(formattedToday);
    setHighDate(formattedToday);
    onApply(formattedToday, formattedToday);
  };

  const handleReset = () => {
    setLowDate("");
    setHighDate("");
    onReset();
  };

  return (
    <div className="date-filter flex flex-wrap items-end gap-4">
      <div>
        <label className="text-gray-900 dark:text-gray-100">
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
        <label className="text-gray-900 dark:text-gray-100">
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
          onClick={handleToday}
          className="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition"
        >
          Today
        </button>

        <button
          onClick={handleReset}
          className="px-4 py-2 rounded-lg bg-gray-300 text-gray-800 font-semibold hover:bg-gray-400 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition"
        >
          Reset
        </button>
      </div>

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

      {/* Display selected date range */}
      <div className="w-full mt-2 text-gray-800 dark:text-gray-200">
        Showing: {lowDate && highDate ? `${lowDate} - ${highDate}` : "All Dates"}
      </div>
    </div>
  );
}
