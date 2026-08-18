// hooks/useServices.js
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api";
import { queryKeys, staleTimes } from "../queryClient";

/**
 * The service list, shared by every page that mounts this hook.
 *
 * Services change rarely, so this carries the longest staleTime in the app —
 * the Open Sales catalog can be rebuilt from cache on every visit.
 */
export const useServices = () => {
  const queryClient = useQueryClient();

  const {
    data: services = [],
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: queryKeys.services,
    queryFn: ({ signal }) => apiRequest("/services", { signal }),
    staleTime: staleTimes.services,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.services });

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

  const mutations = [createMutation, updateMutation, deleteMutation];

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
  };
};
