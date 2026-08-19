import React, { useState } from "react";
import Modal from "../shared/Modal";
import ConfirmDialog from "../shared/ConfirmDialog";
import SearchInput from "../shared/SearchInput";
import FreebieEditor from "../open-sales/FreebieEditor";
import { labelClass, inputClass } from "../shared/fieldStyles";
import { syncFreebieLines, isFreebieLine } from "../../utils/buildSaleItems";
import { freebieGapsFromSaleItems, describeFreebieGaps } from "../../utils/freebies";
import { formatCurrency } from "../../utils/format";

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
  const [pickerQuery, setPickerQuery] = useState("");
  const [localError, setLocalError] = useState(null);
  const [freebieGaps, setFreebieGaps] = useState(null);

  if (!sale) return null;

  /** Replaces `items` with the result of `fn`, leaving everything else alone. */
  const setItems = (fn) => {
    setLocalError(null);
    onUpdate((prev) => ({ ...prev, items: fn(prev.items) }));
  };

  const mapLine = (idx, fn) =>
    setItems((items) => items.map((it, i) => (i === idx ? fn(it) : it)));

  /**
   * The one field on the sale that isn't a line. Emptying it is a real edit —
   * the server reads "" as "clear the name" rather than "leave it alone", so a
   * name typed onto the wrong sale can be taken back off.
   */
  const setCustomerName = (value) => {
    setLocalError(null);
    onUpdate((prev) => ({ ...prev, customer_name: value }));
  };

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
    setPickerQuery("");
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

  const commitSave = () =>
    // Rebuild the derived price-0 freebie lines so the stock they consume
    // matches the service quantities as they now stand.
    onSave({ ...sale, items: syncFreebieLines(sale.items) });

  const handleSave = () => {
    if (sale.items.length === 0) {
      setLocalError("A sale needs at least one line. Delete the sale instead.");
      return;
    }

    // Same guard as checkout: an edit can just as easily leave a freebie the
    // service granted unclaimed.
    const gaps = freebieGapsFromSaleItems(sale.items);
    if (gaps.length > 0) {
      setFreebieGaps(gaps);
      return;
    }
    commitSave();
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

  const pickerTerm = pickerQuery.trim().toLowerCase();
  const pickerItems = inventory.filter(
    (i) =>
      !pickerTerm ||
      i.item_name?.toLowerCase().includes(pickerTerm) ||
      i.item_classification?.toLowerCase().includes(pickerTerm)
  );
  const pickerServices = services.filter(
    (s) => !pickerTerm || s.service_name?.toLowerCase().includes(pickerTerm)
  );

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`✏️ Edit Invoice #${sale.invoice_number}`}
        accent="yellow"
        size="xl"
        variant="sheet"
        footer={
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="font-semibold text-gray-800 dark:text-gray-100">
              Total: {formatCurrency(total)}
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 min-h-11 rounded-md text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 sm:flex-none px-4 min-h-11 rounded-md bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium transition-colors"
              >
                {isSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        }
      >
        {shownError && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-300"
          >
            {shownError}
          </div>
        )}

        <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          <label htmlFor="edit-customer-name" className={labelClass}>
            Customer <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input
            id="edit-customer-name"
            type="text"
            value={sale.customer_name ?? ""}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Who is this sale for?"
            maxLength={255}
            className={inputClass}
          />
        </div>

        <div className="space-y-4">
          {editableLines.length === 0 && (
            <p className="text-sm italic text-gray-500 dark:text-gray-400">
              No items left — add one below, or cancel and delete the sale.
            </p>
          )}

          {editableLines.map(({ line: it, idx }) => (
            <div key={idx} className="border-b border-gray-200 dark:border-gray-700 pb-3">
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
                    className="mt-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-md px-2 min-h-11 w-24 focus:ring-2 focus:ring-yellow-400 outline-none"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-700 dark:text-gray-100">
                    {formatCurrency(Number(it.price) * Number(it.qty))}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    aria-label={`Remove ${it.service_name || it.item_name}`}
                    title="Remove from sale"
                    className="w-11 h-11 rounded-md text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950 text-lg leading-none transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {it.type === "service" && (
                <FreebieEditor
                  freebies={it.freebies || []}
                  slots={Number(it.qty) || 0}
                  inventory={inventory}
                  onAddChoice={(cls) => addModalFreebieChoice(idx, cls)}
                  onChangeItem={(cls, cIdx, value) =>
                    updateModalFreebieChoice(idx, cls, cIdx, value)
                  }
                  onChangeQty={(cls, cIdx, value) =>
                    updateModalFreebieQuantity(idx, cls, cIdx, value)
                  }
                  onRemoveChoice={(cls, cIdx) =>
                    removeModalFreebieChoice(idx, cls, cIdx)
                  }
                />
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
              className="px-4 min-h-11 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
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
                    className={`flex-1 min-h-11 text-sm font-medium transition-colors ${
                      pickerTab === tab
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {tab === "inventory" ? "Inventory" : "Services"}
                  </button>
                ))}
              </div>

              <SearchInput
                value={pickerQuery}
                onChange={setPickerQuery}
                placeholder="Search to add…"
                ariaLabel="Search items to add"
                className="mb-3"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                {pickerTab === "inventory"
                  ? pickerItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addInventory(item)}
                        className="text-left border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 hover:border-blue-500 transition-colors"
                      >
                        <span className="block font-medium text-sm text-gray-900 dark:text-gray-100">
                          {item.item_name}
                        </span>
                        <span className="block text-xs text-gray-600 dark:text-gray-400">
                          {formatCurrency(item.price)} ·{" "}
                          <span
                            className={
                              item.stock === 0 ? "text-red-600 font-semibold" : ""
                            }
                          >
                            Stock: {item.stock}
                          </span>
                        </span>
                      </button>
                    ))
                  : pickerServices.map((service) => (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => addService(service)}
                        className="text-left border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 hover:border-purple-500 transition-colors"
                      >
                        <span className="block font-medium text-sm text-gray-900 dark:text-gray-100">
                          {service.service_name}
                        </span>
                        <span className="block text-xs text-gray-600 dark:text-gray-400">
                          {formatCurrency(service.price)}
                        </span>
                      </button>
                    ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowPicker(false);
                  setPickerQuery("");
                }}
                className="mt-3 text-sm text-gray-600 dark:text-gray-400 hover:underline"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={freebieGaps !== null}
        title="Unused freebie"
        message="Are you sure you want to save this sale? One of your services has a freebie that is unused."
        details={freebieGaps ? describeFreebieGaps(freebieGaps) : []}
        confirmLabel="Save Anyway"
        cancelLabel="Go Back"
        onCancel={() => setFreebieGaps(null)}
        onConfirm={() => {
          setFreebieGaps(null);
          commitSave();
        }}
      />
    </>
  );
};

export default EditSaleModal;
