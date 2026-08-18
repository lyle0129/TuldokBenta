// pages/Services.jsx
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useServices } from "../hooks/useServices";
import { useInventory } from "../hooks/useInventory";
import SearchInput from "../components/shared/SearchInput";
import ConfirmDialog from "../components/shared/ConfirmDialog";
import ServicesList from "../components/services/ServicesList";
import AddServiceModal from "../components/services/AddServiceModal";
import EditServiceModal from "../components/services/EditServiceModal";
import { alertClass } from "../components/shared/fieldStyles";

/**
 * The service catalog. Toolbar panel over list panel, same as Inventory and
 * Closed Sales — this was the last page still rendering its own table and its
 * own hand-rolled modal.
 */
const Services = () => {
  const {
    services,
    isLoading,
    error,
    mutationError,
    isMutating,
    createService,
    updateService,
    deleteService,
  } = useServices();

  // Only for the freebie classifications. Shares the Inventory page's cache
  // entry, so arriving from there costs no request.
  const { inventory } = useInventory();

  const [query, setQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [deletingService, setDeletingService] = useState(null);

  /**
   * Freebie options, with how many items back each one.
   *
   * Raw item_classification values, deliberately un-normalised: FreebieEditor
   * matches them against inventory with a case-sensitive `===`, so prettifying
   * them here would save a freebie that resolves to nothing at the till.
   *
   * Order follows first appearance in inventory, which now arrives in the
   * admin's own sort_order.
   */
  const classifications = useMemo(() => {
    const counts = new Map();
    for (const item of inventory) {
      const cls = item.item_classification;
      if (!cls) continue;
      counts.set(cls, (counts.get(cls) || 0) + 1);
    }
    return [...counts].map(([name, count]) => ({ name, count }));
  }, [inventory]);

  const term = query.trim().toLowerCase();

  const visibleServices = useMemo(
    () =>
      services.filter((service) => {
        if (!term) return true;
        return (
          service.service_name?.toLowerCase().includes(term) ||
          (service.freebies || []).some((f) => f.toLowerCase().includes(term))
        );
      }),
    [services, term]
  );

  const withFreebies = services.filter((s) => (s.freebies || []).length > 0)
    .length;

  // Each form closes only on success, so a rejected write leaves the modal
  // open with the error rather than silently discarding what was typed.
  const handleCreate = async (service) => {
    if (await createService(service)) setIsAdding(false);
  };

  const handleEditSave = async (id, updates) => {
    if (await updateService(id, updates)) setEditingService(null);
  };

  // Deleting used to fire straight from the row with no confirmation at all.
  const handleDeleteConfirm = async () => {
    if (!deletingService) return;
    await deleteService(deletingService.id);
    setDeletingService(null);
  };

  const isFormOpen = isAdding || editingService !== null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-5 text-gray-800 dark:text-gray-100">
        Services
      </h1>

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 mb-6 transition-colors space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search services…"
            ariaLabel="Search services"
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center gap-2 px-6 min-h-11 rounded-md bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold transition flex-shrink-0"
          >
            <Plus size={18} aria-hidden="true" />
            New Service
          </button>
        </div>

        <div className="pt-1 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 pt-3">
            <span className="font-semibold text-gray-800 dark:text-gray-100">
              {services.length} {services.length === 1 ? "service" : "services"}
            </span>
            {withFreebies > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-green-700 dark:text-green-400">
                  {withFreebies} with freebies
                </span>
              </>
            )}
          </p>
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
            Loading services…
          </p>
        ) : error ? (
          <p
            role="alert"
            className="py-10 text-center text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        ) : (
          <ServicesList
            services={visibleServices}
            onEdit={setEditingService}
            onDelete={setDeletingService}
            emptyMessage={
              services.length === 0
                ? "No services yet. Add your first one above."
                : `No services match “${query}”.`
            }
          />
        )}
      </div>

      <AddServiceModal
        open={isAdding}
        onClose={() => setIsAdding(false)}
        onSubmit={handleCreate}
        classifications={classifications}
        existingNames={services.map((s) => s.service_name)}
        isSubmitting={isMutating}
        errorMessage={mutationError}
      />

      <EditServiceModal
        service={editingService}
        onClose={() => setEditingService(null)}
        onSubmit={handleEditSave}
        classifications={classifications}
        isSubmitting={isMutating}
        errorMessage={mutationError}
      />

      <ConfirmDialog
        open={deletingService !== null}
        title="Delete Service"
        message={`Delete “${deletingService?.service_name}”? This cannot be undone.`}
        confirmLabel="Delete"
        accent="red"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingService(null)}
      />
    </div>
  );
};

export default Services;
