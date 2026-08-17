// hooks/useInventory.js
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api";
import { queryKeys, staleTimes } from "../queryClient";

/**
 * The inventory list, shared by every page that mounts this hook.
 *
 * Previously each caller held its own useState copy, so walking Inventory →
 * Services → Open Sales fetched the same list three times. Now they read one
 * cache entry and the mutations below invalidate it.
 *
 * Mutations keep returning true/false rather than throwing, because that is
 * what the Inventory page already branches on.
 */
export const useInventory = () => {
  const queryClient = useQueryClient();

  const {
    data: inventory = [],
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: queryKeys.inventory,
    queryFn: ({ signal }) => apiRequest("/inventory", { signal }),
    staleTime: staleTimes.inventory,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.inventory });

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

  const createInventoryItem = async (item) => {
    try {
      await createMutation.mutateAsync(item);
      return true;
    } catch (err) {
      console.error("Error creating inventory item:", err);
      return false;
    }
  };

  const updateInventoryItem = async (id, updates) => {
    try {
      await updateMutation.mutateAsync({ id, updates });
      return true;
    } catch (err) {
      console.error("Error updating inventory item:", err);
      return false;
    }
  };

  const deleteInventoryItem = async (id) => {
    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch (err) {
      console.error("Error deleting inventory item:", err);
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
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
  };
};
