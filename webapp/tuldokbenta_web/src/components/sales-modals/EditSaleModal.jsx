import React, { useState } from "react";
import { syncFreebieLines, isFreebieLine } from "../../utils/buildSaleItems";

/**
 * Edit an open sale: change quantities, remove lines, and add new items or
 * services — all staged locally and committed in a single save.
 *
 * Every handler replaces objects rather than mutating them. The previous
 * version assigned straight into `updated.items[idx]`, mutating objects React
 * already held; it only re-rendered because the caller happened to deep-clone
 * the sale when opening the modal.
 */
const EditSaleModal = ({
  sale,
  onClose,
  onSave,
  onUpdate,
  inventory = [],
  services = [],
  errorMessage = null,
  isSaving = false,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState("inventory");
  const [localError, setLocalError] = useState(null);

  if (!sale) return null;

  /** Replaces `items` with the result of `fn`, leaving everything else alone. */
  const setItems = (fn) => {
    setLocalError(null);
    onUpdate((prev) => ({ ...prev, items: fn(prev.items) }));
  };

  const mapLine = (idx, fn) =>
    setItems((items) => items.map((it, i) => (i === idx ? fn(it) : it)));

  /**
   * Freebie lines belong to their service, so removing a service takes its
   * freebies with it — otherwise the sale keeps deducting stock for freebies
   * nobody is getting.
   */
  const removeLine = (idx) =>
    setItems((items) => {
      const target = items[idx];
      const orphaned =
        target.type === "service" && Array.isArray(target.freebies)
          ? (it) => isFreebieLine(it) && it.for_service === target.service_name
          : () => false;
      return items.filter((it, i) => i !== idx && !orphaned(it));
    });

  const updateQty = (idx, raw) => {
    // Clamp here rather than trusting the `min` attribute — typing over the
    // field yields "" (Number("") === 0) and paste bypasses it entirely.
    const qty = Math.max(1, Math.floor(Number(raw) || 1));
    mapLine(idx, (it) => ({ ...it, qty }));
  };

  /** Adding something already on the sale bumps its quantity, not a second row. */
  const addLine = (entry) => {
    setItems((items) => {
      const matches = (it) =>
        !isFreebieLine(it) &&
        it.type === entry.type &&
        (entry.type === "item"
          ? it.item_name === entry.item_name
          : it.service_name === entry.service_name);

      const existingIdx = items.findIndex(matches);
      if (existingIdx >= 0) {
        return items.map((it, i) =>
          i === existingIdx ? { ...it, qty: Number(it.qty) + 1 } : it
        );
      }
      return [...items, entry];
    });
    setShowPicker(false);
  };

  const addInventory = (item) =>
    addLine({ type: "item", item_name: item.item_name, qty: 1, price: item.price });

  const addService = (service) =>
    addLine({
      type: "service",
      service_name: service.service_name,
      qty: 1,
      price: service.price,
      freebies: (service.freebies || []).map((cls) => ({
        classification: cls,
        choices: [],
      })),
    });

  // ----- freebie choices (nested inside a service line) ----- //
  const mapFreebies = (idx, classification, fn) =>
    mapLine(idx, (it) => ({
      ...it,
      freebies: it.freebies.map((f) =>
        f.classification === classification ? { ...f, choices: fn(f.choices || []) } : f
      ),
    }));

  const updateModalFreebieChoice = (idx, classification, cIdx, value) =>
    mapFreebies(idx, classification, (choices) =>
      choices.map((c, i) => (i === cIdx ? { ...c, item: value } : c))
    );

  const updateModalFreebieQuantity = (idx, classification, cIdx, value) =>
    mapFreebies(idx, classification, (choices) =>
      choices.map((c, i) =>
        i === cIdx ? { ...c, qty: Math.max(1, Math.floor(Number(value) || 1)) } : c
      )
    );

  const addModalFreebieChoice = (idx, classification) =>
    mapFreebies(idx, classification, (choices) => [...choices, { item: "", qty: 1 }]);

  const removeModalFreebieChoice = (idx, classification, cIdx) =>
    mapFreebies(idx, classification, (choices) => choices.filter((_, i) => i !== cIdx));

  const handleSave = () => {
    if (sale.items.length === 0) {
      setLocalError("A sale needs at least one line. Delete the sale instead.");
      return;
    }
    // Rebuild the derived price-0 freebie lines so the stock they consume
    // matches the service quantities as they now stand.
    onSave({ ...sale, items: syncFreebieLines(sale.items) });
  };

  // Freebie lines are derived, not directly editable — they follow their service.
  const editableLines = sale.items
    .map((it, idx) => ({ line: it, idx }))
    .filter(({ line }) => !isFreebieLine(line));

  const total = sale.items.reduce(
    (sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0),
    0
  );

  const shownError = localError || errorMessage;

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white dark:bg-gray-900 border-t-4 border-yellow-500 rounded-2xl shadow-xl w-full max-w-2xl p-6 sm:p-8 transition-all">
        <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-gray-800 dark:text-gray-100 flex items-center gap-2">
          ✏️ Edit Invoice #{sale.invoice_number}
        </h2>

        {shownError && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-300"
          >
            {shownError}
          </div>
        )}

        <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
          {editableLines.length === 0 && (
            <p className="text-sm italic text-gray-500 dark:text-gray-400">
              No items left — add one below, or cancel and delete the sale.
            </p>
          )}

          {editableLines.map(({ line: it, idx }) => (
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
                    aria-label={`Quantity for ${it.service_name || it.item_name}`}
                    value={it.qty}
                    onChange={(e) => updateQty(idx, e.target.value)}
                    className="mt-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-md px-2 py-1 w-24 focus:ring-2 focus:ring-yellow-400 outline-none"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-700 dark:text-gray-100">
                    ₱{(Number(it.price) * Number(it.qty)).toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    aria-label={`Remove ${it.service_name || it.item_name}`}
                    title="Remove from sale"
                    className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-500 text-lg leading-none px-1"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Freebie editor */}
              {it.type === "service" && it.freebies?.length > 0 && (
                <div className="mt-3 space-y-3">
                  {it.freebies.map((f, fIdx) => {
                    const freebieSlots = it.qty;
                    const totalUsed =
                      f.choices?.reduce((sum, c) => sum + Number(c.qty || 0), 0) || 0;
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
                                  <option key={inv.id} value={inv.item_name}>
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
                                  e.target.value
                                )
                              }
                              className="w-20 mt-2 sm:mt-0 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-md px-2 py-1 focus:ring-2 focus:ring-yellow-400 outline-none"
                            />

                            <button
                              type="button"
                              onClick={() =>
                                removeModalFreebieChoice(idx, f.classification, cIdx)
                              }
                              className="mt-2 sm:mt-0 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-500 text-sm"
                            >
                              ✕
                            </button>
                          </div>
                        ))}

                        {remaining > 0 && (
                          <button
                            type="button"
                            onClick={() => addModalFreebieChoice(idx, f.classification)}
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

        {/* Add a line — staged, saved with everything else */}
        <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
          {!showPicker ? (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              + Add Item or Service
            </button>
          ) : (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex mb-3 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700">
                {["inventory", "service"].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setPickerTab(tab)}
                    className={`flex-1 py-1.5 text-sm font-medium transition-colors ${
                      pickerTab === tab
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {tab === "inventory" ? "Inventory" : "Services"}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                {pickerTab === "inventory"
                  ? inventory.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addInventory(item)}
                        className="text-left border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-lg p-2 hover:border-blue-500 transition-colors"
                      >
                        <span className="block font-medium text-sm text-gray-900 dark:text-gray-100">
                          {item.item_name}
                        </span>
                        <span className="block text-xs text-gray-600 dark:text-gray-400">
                          ₱{item.price} ·{" "}
                          <span className={item.stock === 0 ? "text-red-600 font-semibold" : ""}>
                            Stock: {item.stock}
                          </span>
                        </span>
                      </button>
                    ))
                  : services.map((service) => (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => addService(service)}
                        className="text-left border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-lg p-2 hover:border-purple-500 transition-colors"
                      >
                        <span className="block font-medium text-sm text-gray-900 dark:text-gray-100">
                          {service.service_name}
                        </span>
                        <span className="block text-xs text-gray-600 dark:text-gray-400">
                          ₱{service.price}
                        </span>
                      </button>
                    ))}
              </div>

              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="mt-3 text-sm text-gray-600 dark:text-gray-400 hover:underline"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <span className="font-semibold text-gray-800 dark:text-gray-100">
            Total: ₱{total.toFixed(2)}
          </span>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium transition-colors"
            >
              {isSaving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditSaleModal;