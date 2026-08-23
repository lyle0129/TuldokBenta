// hooks/useInventory.js
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api";
import { queryKeys, staleTimes } from "../queryClient";
import { useActiveShopId } from "./useActiveShop";

/**
 * The inventory list, shared by every page that mounts this hook.
 *
 * Previously each caller held its own useState copy, so walking Inventory →
 * Services → Open Sales fetched the same list three times. Now they read one
 * cache entry and the mutations below invalidate it.
 *
 * The active shop is read here rather than taken as an argument, so that every
 * page calling this hook is unchanged by the move to multi-shop — there is no
 * call site that could forget to pass it.
 *
 * Mutations keep returning true/false rather than throwing, because that is
 * what the Inventory page already branches on.
 */
export const useInventory = () => {
  const queryClient = useQueryClient();
  const shopId = useActiveShopId();
  const key = queryKeys.inventory(shopId);

  const {
    data: inventory = [],
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiRequest("/inventory", { signal }),
    staleTime: staleTimes.inventory,
    // No shop, no request. Without this the query fires with `undefined` in its
    // key and no X-Shop-Id header, takes whatever the backend answers, and
    // caches it under a key no invalidation will ever name again.
    enabled: Boolean(shopId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMutation = useMutation({
    mutationFn: (item) => apiRequest("/inventory", { method: "POST", body: item }),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }) =>
      apiRequest(`/inventory/${id}`, { method: "PUT", body: updates }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiRequest(`/inventory/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const restockMutation = useMutation({
    mutationFn: ({ id, amount }) =>
      apiRequest(`/inventory/${id}/restock`, { method: "POST", body: { amount } }),
    onSuccess: invalidate,
  });

  /**
   * Optimistic on purpose: reordering is a rapid sequence of ▲/▼ taps, and
   * waiting a round trip per tap makes the row visibly lag behind the finger.
   * The server renumbers 1..N and returns the result, so onSettled reconciles.
   */
  const reorderMutation = useMutation({
    mutationFn: (orderedIds) =>
      apiRequest("/inventory/reorder", { method: "POST", body: { orderedIds } }),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);

      if (Array.isArray(previous)) {
        const byId = new Map(previous.map((item) => [item.id, item]));
        const next = orderedIds.map((id) => byId.get(id)).filter(Boolean);
        // Anything the caller left out keeps its place at the end rather than
        // vanishing from the list mid-flight.
        const missing = previous.filter((item) => !orderedIds.includes(item.id));
        queryClient.setQueryData(key, [...next, ...missing]);
      }

      return { previous };
    },
    onError: (_err, _orderedIds, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSettled: invalidate,
  });

  const mutations = [
    createMutation,
    updateMutation,
    deleteMutation,
    restockMutation,
    reorderMutation,
  ];

  /**
   * Clears every mutation's retained error before the next attempt.
   *
   * TanStack keeps `.error` on a mutation until it is reset or re-run, so
   * without this a failed delete would keep the banner up through a later
   * successful restock — the page reads whichever mutation still holds an error.
   */
  const resetErrors = () => mutations.forEach((m) => m.reset());

  const createInventoryItem = async (item) => {
    resetErrors();
    try {
      await createMutation.mutateAsync(item);
      return true;
    } catch (err) {
      console.error("Error creating inventory item:", err);
      return false;
    }
  };

  const updateInventoryItem = async (id, updates) => {
    resetErrors();
    try {
      await updateMutation.mutateAsync({ id, updates });
      return true;
    } catch (err) {
      console.error("Error updating inventory item:", err);
      return false;
    }
  };

  const deleteInventoryItem = async (id) => {
    resetErrors();
    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch (err) {
      console.error("Error deleting inventory item:", err);
      return false;
    }
  };

  /** Adds `amount` to the item's current stock. Never sends an absolute value. */
  const restockInventoryItem = async (id, amount) => {
    resetErrors();
    try {
      await restockMutation.mutateAsync({ id, amount });
      return true;
    } catch (err) {
      console.error("Error restocking inventory item:", err);
      return false;
    }
  };

  /** @param {number[]} orderedIds every item id, in its new display order */
  const reorderInventory = async (orderedIds) => {
    resetErrors();
    try {
      await reorderMutation.mutateAsync(orderedIds);
      return true;
    } catch (err) {
      console.error("Error reordering inventory:", err);
      return false;
    }
  };

  return {
    inventory,
    isLoading,
    isFetching,
    // Read failures used to be swallowed into console.error, leaving the page
    // showing an empty list as if the shop had no stock.
    error: error?.message ?? null,
    // Write failures were swallowed the same way, so a rejected save closed the
    // modal as if it had worked. The page renders this.
    mutationError: mutations.find((m) => m.error)?.error?.message ?? null,
    isMutating: mutations.some((m) => m.isPending),
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    restockInventoryItem,
    reorderInventory,
  };
};
