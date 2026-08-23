// hooks/useServices.js
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api";
import { queryKeys, staleTimes } from "../queryClient";
import { useActiveShopId } from "./useActiveShop";

/**
 * The service list, shared by every page that mounts this hook.
 *
 * Services change rarely, so this carries the longest staleTime in the app —
 * the Open Sales catalog can be rebuilt from cache on every visit. That makes
 * the shop dimension on the key matter more here than anywhere else: a stale
 * unscoped entry would survive a switch for five minutes.
 */
export const useServices = () => {
  const queryClient = useQueryClient();
  const shopId = useActiveShopId();
  const key = queryKeys.services(shopId);

  const {
    data: services = [],
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiRequest("/services", { signal }),
    staleTime: staleTimes.services,
    enabled: Boolean(shopId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMutation = useMutation({
    mutationFn: (service) =>
      apiRequest("/services", { method: "POST", body: service }),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }) =>
      apiRequest(`/services/${id}`, { method: "PUT", body: updates }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiRequest(`/services/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  /**
   * Optimistic on purpose: reordering is a rapid sequence of ▲/▼ taps, and
   * waiting a round trip per tap makes the row visibly lag behind the finger.
   * The server renumbers 1..N and returns the result, so onSettled reconciles.
   */
  const reorderMutation = useMutation({
    mutationFn: (orderedIds) =>
      apiRequest("/services/reorder", { method: "POST", body: { orderedIds } }),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);

      if (Array.isArray(previous)) {
        const byId = new Map(previous.map((service) => [service.id, service]));
        const next = orderedIds.map((id) => byId.get(id)).filter(Boolean);
        // Anything the caller left out keeps its place at the end rather than
        // vanishing from the list mid-flight.
        const missing = previous.filter((s) => !orderedIds.includes(s.id));
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
    reorderMutation,
  ];

  /**
   * Clears every mutation's retained error before the next attempt.
   *
   * TanStack keeps `.error` on a mutation until it is reset or re-run, so
   * without this a failed delete would keep the banner up through a later
   * successful edit — the page reads whichever mutation still holds an error.
   */
  const resetErrors = () => mutations.forEach((m) => m.reset());

  const createService = async (service) => {
    resetErrors();
    try {
      await createMutation.mutateAsync(service);
      return true;
    } catch (err) {
      console.error("Error creating service:", err);
      return false;
    }
  };

  const updateService = async (id, updates) => {
    resetErrors();
    try {
      await updateMutation.mutateAsync({ id, updates });
      return true;
    } catch (err) {
      console.error("Error updating service:", err);
      return false;
    }
  };

  const deleteService = async (id) => {
    resetErrors();
    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch (err) {
      console.error("Error deleting service:", err);
      return false;
    }
  };

  /** @param {number[]} orderedIds every service id, in its new display order */
  const reorderServices = async (orderedIds) => {
    resetErrors();
    try {
      await reorderMutation.mutateAsync(orderedIds);
      return true;
    } catch (err) {
      console.error("Error reordering services:", err);
      return false;
    }
  };

  return {
    services,
    isLoading,
    isFetching,
    error: error?.message ?? null,
    // Write failures were swallowed into console.error, so a rejected save
    // closed the modal as if it had worked. The page renders this.
    mutationError: mutations.find((m) => m.error)?.error?.message ?? null,
    isMutating: mutations.some((m) => m.isPending),
    createService,
    updateService,
    deleteService,
    reorderServices,
  };
};
