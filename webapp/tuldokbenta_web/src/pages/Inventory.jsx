import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useInventory } from "../hooks/useInventory";
import SearchInput from "../components/shared/SearchInput";
import ConfirmDialog from "../components/shared/ConfirmDialog";
import InventoryList, {
  LOW_STOCK_THRESHOLD,
} from "../components/inventory/InventoryList";
import AddItemModal from "../components/inventory/AddItemModal";
import EditItemModal from "../components/inventory/EditItemModal";
import RestockModal from "../components/inventory/RestockModal";
import { alertClass } from "../components/inventory/fieldStyles";

const ALL = "__all__";

/**
 * The item catalog. Toolbar panel over list panel, mirroring Closed Sales.
 *
 * Ordering is the admin's own, persisted as `sort_order` and moved with the ▲/▼
 * buttons on each card. The same order drives the catalog tiles on both Open
 * Sales pages, so the item sold most often can be put within thumb's reach.
 */
const Inventory = () => {
  const {
    inventory,
    isLoading,
    error,
    mutationError,
    isMutating,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    restockInventoryItem,
    reorderInventory,
  } = useInventory();

  const [query, setQuery] = useState("");
  const [classification, setClassification] = useState(ALL);

  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [restockingItem, setRestockingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);

  const classifications = useMemo(
    () =>
      [...new Set(inventory.map((i) => i.item_classification).filter(Boolean))].sort(),
    [inventory]
  );

  const term = query.trim().toLowerCase();

  // Same predicate the sale catalog uses, so searching behaves identically here.
  const visibleItems = useMemo(
    () =>
      inventory.filter((item) => {
        if (classification !== ALL && item.item_classification !== classification) {
          return false;
        }
        if (!term) return true;
        return (
          item.item_name?.toLowerCase().includes(term) ||
          item.item_classification?.toLowerCase().includes(term)
        );
      }),
    [inventory, classification, term]
  );

  // ▲/▼ swap positions in the *full* catalog, so they can only be offered when
  // what is on screen is the full catalog.
  const isFiltered = term !== "" || classification !== ALL;
  const canReorder = !isFiltered;

  const lowCount = inventory.filter((i) => {
    const stock = Number(i.stock) || 0;
    return stock <= LOW_STOCK_THRESHOLD;
  }).length;

  const moveItem = (id, direction) => {
    const index = inventory.findIndex((i) => i.id === id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= inventory.length) return;

    const orderedIds = inventory.map((i) => i.id);
    [orderedIds[index], orderedIds[target]] = [
      orderedIds[target],
      orderedIds[index],
    ];
    reorderInventory(orderedIds);
  };

  // Each handler closes its modal only on success, so a rejected write leaves
  // the form open with the error banner rather than silently discarding it.
  const handleCreate = async (item) => {
    if (await createInventoryItem(item)) setIsAdding(false);
  };

  const handleEditSave = async (id, updates) => {
    if (await updateInventoryItem(id, updates)) setEditingItem(null);
  };

  const handleRestock = async (id, amount) => {
    if (await restockInventoryItem(id, amount)) setRestockingItem(null);
  };

  // Unlike the forms above, this one always closes: there is no typed input to
  // lose, and ConfirmDialog has nowhere to show an error — a failure surfaces
  // in the page banner instead.
  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;
    await deleteInventoryItem(deletingItem.id);
    setDeletingItem(null);
  };

  // The three form modals render their own copy of the error, so the page
  // banner would otherwise be a duplicate sitting behind them.
  const isFormOpen = isAdding || editingItem !== null || restockingItem !== null;

  const tabClass = (active) =>
    `px-4 min-h-11 rounded-md border text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
      active
        ? "bg-blue-600 border-blue-600 text-white"
        : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
    }`;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-5 text-gray-800 dark:text-gray-100">
        Inventory
      </h1>

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 mb-6 transition-colors space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search items…"
            ariaLabel="Search inventory"
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center gap-2 px-6 min-h-11 rounded-md bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold transition flex-shrink-0"
          >
            <Plus size={18} aria-hidden="true" />
            New Item
          </button>
        </div>

        {classifications.length > 0 && (
          <div
            role="tablist"
            aria-label="Filter by classification"
            className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={classification === ALL}
              onClick={() => setClassification(ALL)}
              className={tabClass(classification === ALL)}
            >
              All
            </button>
            {classifications.map((cls) => (
              <button
                key={cls}
                type="button"
                role="tab"
                aria-selected={classification === cls}
                onClick={() => setClassification(cls)}
                className={tabClass(classification === cls)}
              >
                {cls}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 pt-3">
            <span className="font-semibold text-gray-800 dark:text-gray-100">
              {inventory.length} {inventory.length === 1 ? "item" : "items"}
            </span>
            {lowCount > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-orange-600 dark:text-orange-400">
                  {lowCount} low on stock
                </span>
              </>
            )}
          </p>
          {isFiltered && (
            <p className="text-xs italic text-gray-500 dark:text-gray-400 sm:ml-auto sm:pt-3">
              Clear the search and filter to reorder items
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
            Loading inventory…
          </p>
        ) : error ? (
          <p
            role="alert"
            className="py-10 text-center text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        ) : (
          <InventoryList
            items={visibleItems}
            canReorder={canReorder}
            onMove={moveItem}
            onRestock={setRestockingItem}
            onEdit={setEditingItem}
            onDelete={setDeletingItem}
            emptyMessage={
              inventory.length === 0
                ? "No items yet. Add your first one above."
                : `No items match ${term ? `“${query}”` : "this filter"}.`
            }
          />
        )}
      </div>

      <AddItemModal
        open={isAdding}
        onClose={() => setIsAdding(false)}
        onSubmit={handleCreate}
        classifications={classifications}
        existingNames={inventory.map((i) => i.item_name)}
        isSubmitting={isMutating}
        errorMessage={mutationError}
      />

      <EditItemModal
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSubmit={handleEditSave}
        classifications={classifications}
        isSubmitting={isMutating}
        errorMessage={mutationError}
      />

      <RestockModal
        item={restockingItem}
        onClose={() => setRestockingItem(null)}
        onConfirm={handleRestock}
        isSubmitting={isMutating}
        errorMessage={mutationError}
      />

      <ConfirmDialog
        open={deletingItem !== null}
        title="Delete Item"
        message={`Delete “${deletingItem?.item_name}”? This cannot be undone.`}
        confirmLabel="Delete"
        accent="red"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingItem(null)}
      />
    </div>
  );
};

export default Inventory;
