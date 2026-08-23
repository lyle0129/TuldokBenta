// hooks/useAdminShops.js
// The shops a super admin manages. Same shape as usePaymentMethods — one query,
// a mutation per action, and every action resolving to a boolean so a page can
// keep a modal open on failure.
//
// The key carries no shop id, which is the one way this differs from every
// other data hook in the app. These screens act ACROSS shops: api.js sends no
// X-Shop-Id for /admin/*, and backend/routes/admin.js mounts no resolveShop —
// each route takes its subject as an ordinary path parameter instead. A shop
// dimension on this key would describe a scoping that does not exist.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api";
import { queryKeys } from "../queryClient";

/**
 * Every shop, active and inactive.
 *
 * Inactive ones are included because this is the screen you reactivate a shop
 * from — listShops returns them for the same reason. They are also what lets
 * the audit viewer name the shop on an old event after that shop was retired.
 */
export const useAdminShops = () => {
  const queryClient = useQueryClient();
  const key = queryKeys.adminShops();

  const {
    data: shops = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiRequest("/admin/shops", { signal }),
    // No staleTime. This list is read a handful of times a day and must never
    // be stale when someone is deciding who can reach which shop.
    staleTime: 0,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMutation = useMutation({
    mutationFn: (shop) => apiRequest("/admin/shops", { method: "POST", body: shop }),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }) =>
      apiRequest(`/admin/shops/${id}`, { method: "PUT", body: updates }),
    onSuccess: invalidate,
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, active }) =>
      apiRequest(`/admin/shops/${id}/${active ? "reactivate" : "deactivate"}`, {
        method: "POST",
      }),
    onSuccess: invalidate,
  });

  const mutations = [createMutation, updateMutation, activeMutation];

  const resetErrors = () => mutations.forEach((m) => m.reset());

  const createShop = async (shop) => {
    resetErrors();
    try {
      return await createMutation.mutateAsync(shop);
    } catch (err) {
      console.error("Error creating shop:", err);
      return null;
    }
  };

  /**
   * Resolves to the updated shop, not a boolean.
   *
   * The caller needs the body: updateShop attaches a `warning` field when the
   * invoice prefix changed on a shop that already has sales, and Requirement
   * 2.7 says that sentence has to be put in front of the admin. A boolean here
   * would throw it away.
   */
  const updateShop = async (id, updates) => {
    resetErrors();
    try {
      return await updateMutation.mutateAsync({ id, updates });
    } catch (err) {
      console.error("Error updating shop:", err);
      return null;
    }
  };

  const setShopActive = async (id, active) => {
    resetErrors();
    try {
      await activeMutation.mutateAsync({ id, active });
      return true;
    } catch (err) {
      console.error("Error changing shop status:", err);
      return false;
    }
  };

  return {
    shops,
    isLoading,
    error: error?.message ?? null,
    mutationError: mutations.find((m) => m.error)?.error?.message ?? null,
    isMutating: mutations.some((m) => m.isPending),
    createShop,
    updateShop,
    setShopActive,
  };
};

/** `{ [id]: shop }`, for screens that hold a shop id and need its name. */
export const shopsById = (shops = []) =>
  Object.fromEntries(shops.map((shop) => [shop.id, shop]));
