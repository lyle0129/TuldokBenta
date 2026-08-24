import React, { useState, useEffect, useRef } from "react";
import Modal from "../shared/Modal";
import ConfirmDialog from "../shared/ConfirmDialog";
import SearchInput from "../shared/SearchInput";
import QuantityStepper from "../shared/QuantityStepper";
import FreebieEditor from "../open-sales/FreebieEditor";
import { labelClass, inputClass } from "../shared/fieldStyles";
import {
  hydrateSaleItems,
  flattenSaleItems,
  isFreebieLine,
  isFreeLine,
} from "../../utils/buildSaleItems";
import {
  freebieGapsFromSaleItems,
  describeFreebieGaps,
  clampFreebieChoices,
} from "../../utils/freebies";
import { formatCurrency } from "../../utils/format";

/**
 * Edit a sale that hasn't been paid yet: change quantities, remove lines, add
 * new items or services, and pick the freebies each service grants — all staged
 * locally and committed in a single save.
 *
 * Shared by the online list and the offline queue, which is why it stages a
 * plain sale object and hands the whole thing back to `onSave` rather than
 * knowing anything about ids, endpoints or localStorage. The offline page also
 * passes `allowInvoiceEdit`, since it owns its own invoice numbers.
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
  inventory = [],
  services = [],
  errorMessage = null,
  isSaving = false,
  allowInvoiceEdit = false,
}) => {
  // The staged copy. Owned here rather than by the caller: this modal is
  // mounted once and fed whichever row was clicked, so anything left in the
  // caller's hands bleeds from one sale onto the next. That was a live bug —
  // dismissing the freebie warning on one sale and opening another re-raised
  // it, and confirming it saved the *second* sale.
  const [draft, setDraft] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState("inventory");
  const [pickerQuery, setPickerQuery] = useState("");
  const [localError, setLocalError] = useState(null);
  const [freebieGaps, setFreebieGaps] = useState(null);
  // Any edit invalidates the last failure the server reported — "Not enough
  // stock for X" stops being true the moment X's quantity is changed.
  const [editedSinceSave, setEditedSinceSave] = useState(false);

  /** The sale the draft was built from, and whether it has been touched since. */
  const seededFrom = useRef(null);
  const touched = useRef(false);

  // Declared above the null guard: hooks must run in the same order on every
  // render. Reseeds everything, not just the draft — a stale error or a stale
  // warning is just as wrong as stale lines.
  //
  // The catalog is a dependency because the draft is built from it: a sale
  // opened before inventory and services have landed would hydrate against an
  // empty catalog and show every freebie as a loose line. Re-seeding when it
  // arrives fixes that — but only while the draft is untouched, or a background
  // refetch would throw away edits in progress.
  useEffect(() => {
    const isNewSale = seededFrom.current !== sale;
    if (!isNewSale && touched.current) return;

    seededFrom.current = sale;
    touched.current = false;

    setDraft(
      sale
        ? {
            ...structuredClone(sale),
            items: hydrateSaleItems(structuredClone(sale.items ?? []), {
              services,
              inventory,
            }),
          }
        : null
    );
    setLocalError(null);
    setFreebieGaps(null);
    setShowPicker(false);
    setPickerQuery("");
    setEditedSinceSave(false);
  }, [sale, services, inventory]);

  // `draft` lands one render behind `sale`, since effects run after paint.
  if (!sale || !draft) return null;

  /** Replaces `items` with the result of `fn`, leaving everything else alone. */
  const setItems = (fn) => {
    setLocalError(null);
    setEditedSinceSave(true);
    touched.current = true;
    setDraft((prev) => ({ ...prev, items: fn(prev.items) }));
  };

  const mapLine = (idx, fn) =>
    setItems((items) => items.map((it, i) => (i === idx ? fn(it) : it)));

  /** The fields on the sale that aren't lines. */
  const setField = (key, value) => {
    setLocalError(null);
    setEditedSinceSave(true);
    touched.current = true;
    setDraft((prev) => ({ ...prev, [key]: value }));
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
    mapLine(idx, (it) =>
      // Lowering a service's quantity strands any freebie already claimed
      // against the slots that just disappeared. Trim them with the quantity so
      // FreebieEditor's "N left to claim" is honest while the cashier is still
      // looking at it; syncFreebieLines enforces the same rule on save.
      it.type === "service" && Array.isArray(it.freebies)
        ? { ...it, qty, freebies: clampFreebieChoices(it.freebies, qty) }
        : { ...it, qty }
    );
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

  const commitSave = () => {
    // Cleared before the call, not after: `onSave` is async and the caller sets
    // `errorMessage` when it resolves, so clearing afterwards would hide the
    // failure we just asked for.
    setEditedSinceSave(false);
    // Back to the stored shape: each service's picks become plain price-0 item
    // lines and the `freebies` array comes off, so the sale is saved the way it
    // has always been saved.
    return onSave({ ...draft, items: flattenSaleItems(draft.items) });
  };

  const handleSave = () => {
    if (draft.items.length === 0) {
      setLocalError("A sale needs at least one line. Delete the sale instead.");
      return;
    }

    if (allowInvoiceEdit && !String(draft.invoice_number ?? "").trim()) {
      setLocalError("A sale needs an invoice number.");
      return;
    }

    // Same guard as checkout: an edit can just as easily leave a freebie the
    // service granted unclaimed.
    const gaps = freebieGapsFromSaleItems(draft.items);
    if (gaps.length > 0) {
      setFreebieGaps(gaps);
      return;
    }
    commitSave();
  };

  /**
   * Which lines get a row of their own.
   *
   * Only *tagged* lines are hidden: those are regenerated from the service that
   * granted them, and are already on screen inside its FreebieEditor, so an
   * editable row would be a second control for the same thing.
   *
   * A plain price-0 line is a different animal. Most sales on file record their
   * freebies that way — a bare `{ type: "item", price: 0, item_name: "Plastic" }`
   * with nothing tying it to a service — and nothing else renders it, so hiding
   * it would make the freebie uneditable and invisible at once. It stays a
   * normal row, marked Free.
   */
  const editableLines = draft.items
    .map((it, idx) => ({ line: it, idx }))
    .filter(({ line }) => !isFreebieLine(line));

  const total = draft.items.reduce(
    (sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0),
    0
  );

  const shownError = localError || (editedSinceSave ? null : errorMessage);

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
          {/* Offline only. The server hands out invoice numbers, but a queued sale
              carries one allocated offline and printed on the customer's receipt —
              so it has to be fixable before the sale is printed or synced. */}
          {allowInvoiceEdit && (
            <div className="mb-4">
              <label htmlFor="edit-invoice-number" className={labelClass}>
                Invoice number
              </label>
              <input
                id="edit-invoice-number"
                type="text"
                value={draft.invoice_number ?? ""}
                onChange={(e) => setField("invoice_number", e.target.value)}
                className={`${inputClass} sm:w-48 font-mono`}
              />
            </div>
          )}

          <label htmlFor="edit-customer-name" className={labelClass}>
            Customer <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input
            id="edit-customer-name"
            type="text"
            value={draft.customer_name ?? ""}
            /* Emptying it is a real edit — the server reads "" as "clear the
               name" rather than "leave it alone", so a name typed onto the
               wrong sale can be taken back off. */
            onChange={(e) => setField("customer_name", e.target.value)}
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
                    {isFreeLine(it) && (
                      <span className="ml-2 align-middle rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                        Free
                      </span>
                    )}
                  </p>
                  {/* "of", not "for" — the label on the number itself is
                      "Quantity for X", and two controls whose names differ
                      only by a preposition would be read out as the same
                      thing. */}
                  <QuantityStepper
                    className="mt-1"
                    value={it.qty}
                    onChange={(next) => updateQty(idx, next)}
                    label={`Quantity for ${it.service_name || it.item_name}`}
                    decreaseLabel={`Decrease quantity of ${
                      it.service_name || it.item_name
                    }`}
                    increaseLabel={`Increase quantity of ${
                      it.service_name || it.item_name
                    }`}
                    focusRing="focus:ring-yellow-400"
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
