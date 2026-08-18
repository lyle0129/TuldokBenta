// pages/PaymentMethods.jsx
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { usePaymentMethods } from "../hooks/usePaymentMethods";
import SearchInput from "../components/shared/SearchInput";
import ConfirmDialog from "../components/shared/ConfirmDialog";
import PaymentMethodsList from "../components/payment-methods/PaymentMethodsList";
import AddPaymentMethodModal from "../components/payment-methods/AddPaymentMethodModal";
import EditPaymentMethodModal from "../components/payment-methods/EditPaymentMethodModal";
import { alertClass } from "../components/shared/fieldStyles";

/**
 * What the pay dialog offers.
 *
 * The list used to be two hardcoded <option> tags, so taking a new kind of
 * payment meant a code change. Same toolbar-over-list layout as Services and
 * Inventory.
 */
const PaymentMethods = () => {
  const {
    paymentMethods,
    isLoading,
    error,
    mutationError,
    isMutating,
    createPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    reorderPaymentMethods,
  } = usePaymentMethods();

  const [query, setQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingMethod, setEditingMethod] = useState(null);
  const [deletingMethod, setDeletingMethod] = useState(null);

  const term = query.trim().toLowerCase();

  const visibleMethods = useMemo(
    () =>
      paymentMethods.filter((method) => {
        if (!term) return true;
        return (
          method.label?.toLowerCase().includes(term) ||
          method.code?.toLowerCase().includes(term)
        );
      }),
    [paymentMethods, term]
  );

  const activeCount = paymentMethods.filter((m) => m.is_active).length;

  // ▲/▼ swap positions in the *full* list, so they can only be offered when
  // what is on screen is the full list.
  const canReorder = term === "";

  const moveMethod = (id, direction) => {
    const index = paymentMethods.findIndex((m) => m.id === id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= paymentMethods.length) return;

    const orderedIds = paymentMethods.map((m) => m.id);
    [orderedIds[index], orderedIds[target]] = [
      orderedIds[target],
      orderedIds[index],
    ];
    reorderPaymentMethods(orderedIds);
  };

  // Each form closes only on success, so a rejected write leaves the modal
  // open with the error rather than silently discarding what was typed.
  const handleCreate = async (method) => {
    if (await createPaymentMethod(method)) setIsAdding(false);
  };

  const handleEditSave = async (id, updates) => {
    if (await updatePaymentMethod(id, updates)) setEditingMethod(null);
  };

  const handleToggleActive = (method) =>
    updatePaymentMethod(method.id, { is_active: !method.is_active });

  // Always closes: the confirm dialog has nowhere to show an error, so a
  // failure surfaces in the page-level banner instead.
  const handleDeleteConfirm = async () => {
    if (!deletingMethod) return;
    await deletePaymentMethod(deletingMethod.id);
    setDeletingMethod(null);
  };

  const isFormOpen = isAdding || editingMethod !== null;

  const deletingUsage = deletingMethod?.usage_count ?? 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-5 text-gray-800 dark:text-gray-100">
        Payment Methods
      </h1>

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 mb-6 transition-colors space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search payment methods…"
            ariaLabel="Search payment methods"
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center gap-2 px-6 min-h-11 rounded-md bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold transition flex-shrink-0"
          >
            <Plus size={18} aria-hidden="true" />
            New Method
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 pt-3">
            <span className="font-semibold text-gray-800 dark:text-gray-100">
              {paymentMethods.length}{" "}
              {paymentMethods.length === 1 ? "method" : "methods"}
            </span>
            {" · "}
            <span className="font-semibold text-green-700 dark:text-green-400">
              {activeCount} active
            </span>
          </p>
          {!canReorder && (
            <p className="text-xs italic text-gray-500 dark:text-gray-400 sm:ml-auto sm:pt-3">
              Clear the search to reorder methods
            </p>
          )}
        </div>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 transition-colors">
        {mutationError && !isFormOpen && (
          <div role="alert" className={`${alertClass} mb-4`}>
            {mutationError}
          </div>
        )}

        {isLoading ? (
          <p className="py-10 text-center text-gray-500 dark:text-gray-400 animate-pulse">
            Loading payment methods…
          </p>
        ) : error ? (
          <p
            role="alert"
            className="py-10 text-center text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        ) : (
          <PaymentMethodsList
            methods={visibleMethods}
            canReorder={canReorder}
            onMove={moveMethod}
            onToggleActive={handleToggleActive}
            onEdit={setEditingMethod}
            onDelete={setDeletingMethod}
            emptyMessage={
              paymentMethods.length === 0
                ? "No payment methods yet. Add your first one above."
                : `No payment methods match “${query}”.`
            }
          />
        )}
      </div>

      <AddPaymentMethodModal
        open={isAdding}
        onClose={() => setIsAdding(false)}
        onSubmit={handleCreate}
        existingCodes={paymentMethods.map((m) => m.code)}
        isSubmitting={isMutating}
        errorMessage={mutationError}
      />

      <EditPaymentMethodModal
        method={editingMethod}
        onClose={() => setEditingMethod(null)}
        onSubmit={handleEditSave}
        isSubmitting={isMutating}
        errorMessage={mutationError}
      />

      <ConfirmDialog
        open={deletingMethod !== null}
        title="Delete Payment Method"
        message={
          deletingUsage > 0
            ? `“${deletingMethod?.label}” is recorded on ${deletingUsage} closed ${
                deletingUsage === 1 ? "sale" : "sales"
              }. Those sales keep their record but will show “${
                deletingMethod?.code
              }” in reports instead of this name. Deactivating it hides it from the pay dialog without losing the name — delete anyway?`
            : `Delete “${deletingMethod?.label}”? This cannot be undone.`
        }
        confirmLabel="Delete"
        accent="red"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingMethod(null)}
      />
    </div>
  );
};

export default PaymentMethods;
