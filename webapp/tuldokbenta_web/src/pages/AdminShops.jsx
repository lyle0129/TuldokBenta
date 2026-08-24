// pages/AdminShops.jsx
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useAdminShops } from "../hooks/useAdminShops";
import SearchInput from "../components/shared/SearchInput";
import ConfirmDialog from "../components/shared/ConfirmDialog";
import ShopsList from "../components/admin/ShopsList";
import AddShopModal from "../components/admin/AddShopModal";
import EditShopModal from "../components/admin/EditShopModal";
import ReceiptPreviewModal from "../components/admin/ReceiptPreviewModal";
import { alertClass } from "../components/shared/fieldStyles";

/**
 * Opening and closing branches.
 *
 * Same toolbar-over-list layout as PaymentMethods, Services and Inventory. The
 * one structural difference is that there is no delete: five tables reference
 * shops(id), the backend exposes no DELETE route, and deactivation is the
 * removal path.
 */
const AdminShops = () => {
  const {
    shops,
    isLoading,
    error,
    mutationError,
    isMutating,
    createShop,
    updateShop,
    setShopActive,
    saveShopLogo,
  } = useAdminShops();

  const [query, setQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingShop, setEditingShop] = useState(null);
  const [editWarning, setEditWarning] = useState(null);
  const [previewShop, setPreviewShop] = useState(null);
  const [togglingShop, setTogglingShop] = useState(null);

  const term = query.trim().toLowerCase();

  const visibleShops = useMemo(
    () =>
      shops.filter((shop) => {
        if (!term) return true;
        return (
          shop.name?.toLowerCase().includes(term) ||
          shop.slug?.toLowerCase().includes(term)
        );
      }),
    [shops, term]
  );

  const activeCount = shops.filter((s) => s.is_active).length;

  /**
   * The logo is a second request, made after the shop exists.
   *
   * A new shop has no id to upload against until it is created, so the modal
   * holds the picked file and it is sent here. A failed upload does not undo the
   * shop — the admin has a shop with no logo, which they can fix by editing it,
   * and that is a better outcome than losing the shop.
   */
  const handleCreate = async (shop, pendingLogo) => {
    const created = await createShop(shop);
    if (!created) return;

    if (pendingLogo) await saveShopLogo(created.id, pendingLogo);
    setIsAdding(false);
  };

  /**
   * Closes on a clean save, and stays open holding the warning otherwise.
   *
   * The write has already succeeded either way — the warning is information
   * about a consequence, not a refusal. Closing the modal and dropping it on
   * the floor is what Requirement 2.7 exists to prevent.
   *
   * `pendingLogo` is undefined when the logo was not touched, null when it was
   * cleared, and a File when a new one was picked — so an edit to the address
   * alone sends no logo request at all.
   */
  const handleEditSave = async (id, updates, pendingLogo) => {
    const updated = await updateShop(id, updates);
    if (!updated) return;

    if (pendingLogo !== undefined) {
      if (!(await saveShopLogo(id, pendingLogo))) return;
    }

    if (updated.warning) {
      setEditingShop(updated);
      setEditWarning(updated.warning);
      return;
    }

    closeEdit();
  };

  const closeEdit = () => {
    setEditingShop(null);
    setEditWarning(null);
  };

  const openEdit = (shop) => {
    setEditWarning(null);
    setEditingShop(shop);
  };

  const handleToggleConfirm = async () => {
    if (!togglingShop) return;
    await setShopActive(togglingShop.id, !togglingShop.is_active);
    setTogglingShop(null);
  };

  const isFormOpen = isAdding || editingShop !== null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-5 text-gray-800 dark:text-gray-100">
        Shops
      </h1>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 mb-6 transition-colors space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search shops…"
            ariaLabel="Search shops"
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center gap-2 px-6 min-h-11 rounded-md bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold transition flex-shrink-0"
          >
            <Plus size={18} aria-hidden="true" />
            New Shop
          </button>
        </div>

        <div className="pt-1 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 pt-3">
            <span className="font-semibold text-gray-800 dark:text-gray-100">
              {shops.length} {shops.length === 1 ? "shop" : "shops"}
            </span>
            {" · "}
            <span className="font-semibold text-green-700 dark:text-green-400">
              {activeCount} active
            </span>
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 transition-colors">
        {mutationError && !isFormOpen && (
          <div role="alert" className={`${alertClass} mb-4`}>
            {mutationError}
          </div>
        )}

        {isLoading ? (
          <p className="py-10 text-center text-gray-500 dark:text-gray-400 animate-pulse">
            Loading shops…
          </p>
        ) : error ? (
          <p role="alert" className="py-10 text-center text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : (
          <ShopsList
            shops={visibleShops}
            onEdit={openEdit}
            onPreview={setPreviewShop}
            onToggleActive={setTogglingShop}
            emptyMessage={
              shops.length === 0
                ? "No shops yet. Create your first one above."
                : `No shops match “${query}”.`
            }
          />
        )}
      </div>

      <AddShopModal
        open={isAdding}
        onClose={() => setIsAdding(false)}
        onSubmit={handleCreate}
        existingSlugs={shops.map((s) => s.slug)}
        isSubmitting={isMutating}
        errorMessage={mutationError}
      />

      <EditShopModal
        shop={editingShop}
        onClose={closeEdit}
        onSubmit={handleEditSave}
        warning={editWarning}
        isSubmitting={isMutating}
        errorMessage={mutationError}
      />

      <ReceiptPreviewModal
        shop={previewShop}
        onClose={() => setPreviewShop(null)}
      />

      <ConfirmDialog
        open={togglingShop !== null}
        title={togglingShop?.is_active ? "Deactivate Shop" : "Reactivate Shop"}
        message={
          togglingShop?.is_active
            ? `Deactivate “${togglingShop?.name}”? It disappears from every shop picker and nobody can take a sale there. Its sales, stock and history are untouched and come back if you reactivate it.`
            : `Reactivate “${togglingShop?.name}”? It reappears in the shop picker for everyone assigned to it.`
        }
        confirmLabel={togglingShop?.is_active ? "Deactivate" : "Reactivate"}
        accent={togglingShop?.is_active ? "red" : "green"}
        onConfirm={handleToggleConfirm}
        onCancel={() => setTogglingShop(null)}
      />
    </div>
  );
};

export default AdminShops;
