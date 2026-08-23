// components/admin/AssignShopsModal.jsx
import { useEffect, useState } from "react";
import Modal from "../shared/Modal";
import ShopCheckboxes from "./ShopCheckboxes";
import {
  alertClass,
  noticeClass,
  cancelButtonClass,
  submitButtonClass,
} from "../shared/fieldStyles";

/**
 * Where a person works.
 *
 * The whole set is sent, not a diff — setUserShops deletes and re-inserts in one
 * transaction — so what is ticked here is exactly what the account will hold
 * afterwards. That is why ShopCheckboxes keeps showing an inactive shop the user
 * is already assigned to: unticking it has to be a decision, not a side effect
 * of it having scrolled out of the list.
 */
const AssignShopsModal = ({
  user,
  shops = [],
  onClose,
  onSubmit,
  isSubmitting = false,
  errorMessage = null,
}) => {
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (user) setSelected(user.shop_ids ?? []);
  }, [user]);

  if (!user) return null;

  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title={`Shops for ${user.username}`}
      accent="blue"
      size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button type="button" onClick={onClose} className={cancelButtonClass}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(user.id, selected)}
            disabled={isSubmitting}
            className={submitButtonClass("bg-blue-600 hover:bg-blue-700")}
          >
            {isSubmitting ? "Saving…" : "Save Assignments"}
          </button>
        </div>
      }
    >
      {errorMessage && (
        <div role="alert" className={`${alertClass} mb-4`}>
          {errorMessage}
        </div>
      )}

      <div className="space-y-4">
        <ShopCheckboxes
          shops={shops}
          selected={selected}
          onChange={setSelected}
          role={user.role}
          idPrefix="assign"
        />

        {/* An account with no assignment is a real state — it exists but has
            nowhere to work, and RequireRole sends it to the picker, which has
            nothing to offer. Worth saying before it is saved. */}
        {selected.length === 0 && user.role !== "super_admin" && (
          <p className={noticeClass}>
            With no shops assigned, this person can sign in but has nowhere to
            work until you assign one.
          </p>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-400">
          A signed-in user sees a change here after their session next refreshes.
        </p>
      </div>
    </Modal>
  );
};

export default AssignShopsModal;
