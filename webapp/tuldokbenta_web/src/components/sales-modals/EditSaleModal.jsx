import React from "react";

const EditSaleModal = ({ sale, onClose, onSave, onUpdate, inventory }) => {
  if (!sale) return null;

  // Freebie helper callbacks — call onUpdate instead of setEditingSale
  const updateModalFreebieChoice = (idx, classification, cIdx, value) => {
    onUpdate((prev) => {
      const updated = { ...prev };
      const freebies = updated.items[idx].freebies;
      const fIndex = freebies.findIndex((f) => f.classification === classification);
      if (fIndex >= 0) freebies[fIndex].choices[cIdx].item = value;
      return updated;
    });
  };

  const updateModalFreebieQuantity = (idx, classification, cIdx, value) => {
    onUpdate((prev) => {
      const updated = { ...prev };
      const freebies = updated.items[idx].freebies;
      const fIndex = freebies.findIndex((f) => f.classification === classification);
      if (fIndex >= 0) freebies[fIndex].choices[cIdx].qty = value;
      return updated;
    });
  };

  const addModalFreebieChoice = (idx, classification) => {
    onUpdate((prev) => {
      const updated = { ...prev };
      const freebies = updated.items[idx].freebies;
      const fIndex = freebies.findIndex((f) => f.classification === classification);
      if (fIndex >= 0) freebies[fIndex].choices.push({ item: "", qty: 1 });
      return updated;
    });
  };

  const removeModalFreebieChoice = (idx, classification, cIdx) => {
    onUpdate((prev) => {
      const updated = { ...prev };
      const freebies = updated.items[idx].freebies;
      const fIndex = freebies.findIndex((f) => f.classification === classification);
      if (fIndex >= 0) freebies[fIndex].choices.splice(cIdx, 1);
      return updated;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white dark:bg-gray-900 border-t-4 border-yellow-500 rounded-2xl shadow-xl w-full max-w-2xl p-6 sm:p-8 transition-all">
        <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-gray-800 dark:text-gray-100 flex items-center gap-2">
          ✏️ Edit Invoice #{sale.invoice_number}
        </h2>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {sale.items.map((it, idx) => (
            <div
              key={idx}
              className="border-b border-gray-200 dark:border-gray-700 pb-3"
            >
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-100">
                    {it.type === "service" ? it.service_name : it.item_name}
                  </p>
                  <input
                    type="number"
                    min="1"
                    value={it.qty}
                    onChange={(e) => {
                      const newQty = Number(e.target.value);
                      onUpdate((prev) => {
                        const updated = { ...prev };
                        updated.items[idx].qty = newQty;
                        return updated;
                      });
                    }}
                    className="mt-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-md px-2 py-1 w-24 focus:ring-2 focus:ring-yellow-400 outline-none"
                  />
                </div>
                <span className="font-semibold text-gray-700 dark:text-gray-100">
                  ₱{(Number(it.price) * Number(it.qty)).toFixed(2)}
                </span>
              </div>

              {/* Freebie editor */}
              {it.type === "service" && it.freebies?.length > 0 && (
                <div className="mt-3 space-y-3">
                  {it.freebies.map((f, fIdx) => {
                    const freebieSlots = it.qty;
                    const totalUsed =
                      f.choices?.reduce((sum, c) => sum + c.qty, 0) || 0;
                    const remaining = freebieSlots - totalUsed;

                    return (
                      <div key={fIdx}>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                          Choose {f.classification} ({freebieSlots} free):
                        </label>

                        {f.choices?.map((choice, cIdx) => (
                          <div
                            key={cIdx}
                            className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 mb-2"
                          >
                            <select
                              value={choice.item || ""}
                              onChange={(e) =>
                                updateModalFreebieChoice(
                                  idx,
                                  f.classification,
                                  cIdx,
                                  e.target.value
                                )
                              }
                              className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-2 py-1 rounded-md focus:ring-2 focus:ring-yellow-400 outline-none"
                            >
                              <option value="">-- Select --</option>
                              {inventory
                                .filter(
                                  (inv) =>
                                    inv.item_classification === f.classification
                                )
                                .map((inv) => (
                                  <option key={inv._id} value={inv.item_name}>
                                    {inv.item_name}
                                  </option>
                                ))}
                            </select>

                            <input
                              type="number"
                              min="1"
                              max={freebieSlots}
                              value={choice.qty}
                              onChange={(e) =>
                                updateModalFreebieQuantity(
                                  idx,
                                  f.classification,
                                  cIdx,
                                  Number(e.target.value)
                                )
                              }
                              className="w-20 mt-2 sm:mt-0 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-md px-2 py-1 focus:ring-2 focus:ring-yellow-400 outline-none"
                            />

                            <button
                              onClick={() =>
                                removeModalFreebieChoice(
                                  idx,
                                  f.classification,
                                  cIdx
                                )
                              }
                              className="mt-2 sm:mt-0 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-500 text-sm"
                            >
                              ✕
                            </button>
                          </div>
                        ))}

                        {remaining > 0 && (
                          <button
                            onClick={() =>
                              addModalFreebieChoice(idx, f.classification)
                            }
                            className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md text-sm transition-colors"
                          >
                            + Add {f.classification}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(sale)}
            className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditSaleModal;
