// hooks/useShopProfile.js
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api";
import { queryKeys, staleTimes } from "../queryClient";
import { useActiveShopId } from "./useActiveShop";

/**
 * The receipt header this shop prints.
 *
 * Read on every print and edited a handful of times ever, so it carries the same
 * long staleTime as payment methods and is restored from disk at boot for the
 * same reason: the alternative is a receipt handed over with no shop name on it.
 *
 * The logo travels inside `logo_data_url` as base64 rather than as a link. A
 * receipt is printed into a popup whose <img> can send no Authorization or
 * X-Shop-Id header, and the offline page has no connection to fetch one over —
 * inline is the only form that works in both places.
 */
export const useShopProfile = () => {
  const queryClient = useQueryClient();
  const shopId = useActiveShopId();
  const key = queryKeys.shopProfile(shopId);

  const {
    data: shopProfile = null,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiRequest("/shop-profile", { signal }),
    staleTime: staleTimes.shopProfile,
    enabled: Boolean(shopId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const updateMutation = useMutation({
    mutationFn: (updates) =>
      apiRequest("/shop-profile", { method: "PUT", body: updates }),
    onSuccess: invalidate,
  });

  const uploadLogoMutation = useMutation({
    // The File goes out as itself. apiRequest sends it unwrapped and untouched,
    // with the file's own type as the Content-Type, which is what the server
    // matches on to decide the body is an image at all.
    mutationFn: (file) =>
      apiRequest("/shop-profile/logo", { method: "POST", rawBody: file }),
    onSuccess: invalidate,
  });

  const removeLogoMutation = useMutation({
    mutationFn: () => apiRequest("/shop-profile/logo", { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const mutations = [updateMutation, uploadLogoMutation, removeLogoMutation];
  const resetErrors = () => mutations.forEach((m) => m.reset());

  /**
   * Resolves the updated profile rather than a boolean, unlike most actions in
   * these hooks. The server attaches a `warning` when the invoice prefix changed
   * on a shop that already has sales, and the page has to be able to show it —
   * the same reason useAdminShops.updateShop returns its row.
   */
  const updateProfile = async (updates) => {
    resetErrors();
    try {
      return await updateMutation.mutateAsync(updates);
    } catch (err) {
      console.error("Error updating shop profile:", err);
      return null;
    }
  };

  const uploadLogo = async (file) => {
    resetErrors();
    try {
      await uploadLogoMutation.mutateAsync(file);
      return true;
    } catch (err) {
      console.error("Error uploading shop logo:", err);
      return false;
    }
  };

  const removeLogo = async () => {
    resetErrors();
    try {
      await removeLogoMutation.mutateAsync();
      return true;
    } catch (err) {
      console.error("Error removing shop logo:", err);
      return false;
    }
  };

  return {
    shopProfile,
    isLoading,
    isFetching,
    error: error?.message ?? null,
    mutationError: mutations.find((m) => m.error)?.error?.message ?? null,
    isMutating: mutations.some((m) => m.isPending),
    updateProfile,
    uploadLogo,
    removeLogo,
  };
};
