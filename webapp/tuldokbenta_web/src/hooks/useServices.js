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

  const createService = async (service) => {
    try {
      await createMutation.mutateAsync(service);
      return true;
    } catch (err) {
      console.error("Error creating service:", err);
      return false;
    }
  };

  const updateService = async (id, updates) => {
    try {
      await updateMutation.mutateAsync({ id, updates });
      return true;
    } catch (err) {
      console.error("Error updating service:", err);
      return false;
    }
  };

  const deleteService = async (id) => {
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
    createService,
    updateService,
    deleteService,
  };
};
