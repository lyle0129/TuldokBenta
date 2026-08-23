// components/admin/CorrectDatesModal.jsx
import { useEffect, useState } from "react";
import Modal from "../shared/Modal";
import {
  useCorrectSaleDates,
  toApiTimestamp,
  toInputValue,
} from "../../hooks/useCorrectSaleDates";
import {
  labelClass,
  inputClass,
  alertClass,
  noticeClass,
  cancelButtonClass,
  submitButtonClass,
} from "../shared/fieldStyles";

/**
 * Moving the dates a sale was encoded with.
 *
 * Reachable from the sales lists rather than only from the Console, because the
 * question "was this on the wrong day?" arises while looking at sales — and
 * making a super admin navigate away to act on it is an invitation to do it in
 * the database instead.
 *
 * @param {{table: "open"|"closed", sale: object|null, onClose: Function}} props
 */
const CorrectDatesModal = ({ table, sale, onClose }) => {
  const { correctDates, isSaving } = useCorrectSaleDates();

  const [createdAt, setCreatedAt] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sale) return;
    setCreatedAt(toInputValue(sale.created_at));
    setPaidAt(toInputValue(sale.paid_at));
    setError(null);
  }, [sale]);

  if (!sale) return null;

  // An open sale's paid_at is NULL for every legitimately open row — paySale
  // moves the row into closed_sales rather than stamping the column — so the
  // field is not offered, and planDateCorrection refuses the key outright.
  const isClosed = table === "closed";

  const createdChanged = createdAt !== toInputValue(sale.created_at);
  const paidChanged = isClosed && paidAt !== toInputValue(sale.paid_at);
  const canSave = (createdChanged || paidChanged) && createdAt !== "";

  const save = async () => {
    if (!canSave || isSaving) return;

    // Only the fields that actually changed. An absent key is left untouched
    // server-side, which is not the same as writing back the value just read.
    const patch = {};
    if (createdChanged) patch.created_at = toApiTimestamp(createdAt);
    if (paidChanged) patch.paid_at = toApiTimestamp(paidAt);

    const { ok, message } = await correctDates(table, sale, patch);
    if (ok) {
      onClose();
      return;
    }

    // The server's own sentence — "A sale cannot be paid before it was created",
    // "That date is in the future" — and the dialog stays open holding what was
    // typed. Nothing was written and nothing was invalidated.
    setError(message);
  };

  return (
    <Modal
      open={Boolean(sale)}
      onClose={onClose}
      title={`Correct dates · Invoice #${sale.invoice_number}`}
      accent="red"
      size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button type="button" onClick={onClose} className={cancelButtonClass}>
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave || isSaving}
            className={submitButtonClass("bg-red-600 hover:bg-red-700")}
          >
            {isSaving ? "Saving…" : "Change Dates"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div role="alert" className={alertClass}>
            {error}
          </div>
        )}

        {/* Requirement 5.4, and R4 in the overview's risk register. Reports
            bucket on these two columns, so this is not an edit to a label — the
            feature is intended, the surprise is not. */}
        <p className={noticeClass}>
          Changing this date changes what past reports show for the affected days.
        </p>

        <div>
          <label className={labelClass} htmlFor="correct-created">
            Created at
          </label>
          <input
            id="correct-created"
            type="datetime-local"
            value={createdAt}
            onChange={(e) => setCreatedAt(e.target.value)}
            className={inputClass}
          />
        </div>

        {isClosed && (
          <div>
            <label className={labelClass} htmlFor="correct-paid">
              Paid at
            </label>
            <input
              id="correct-paid"
              type="datetime-local"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className={inputClass}
            />
          </div>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-400">
          The sale's lines, stock and invoice number are untouched. Every
          correction is recorded in the audit log with both the old and the new
          dates.
        </p>
      </div>
    </Modal>
  );
};

export default CorrectDatesModal;
