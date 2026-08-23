// hooks/useAdminUsers.js
// Accounts, their roles and their shop assignments.
//
// Every refusal this surface can produce is a sentence the server wrote — "There
// must be at least one active super admin", "You cannot deactivate your own
// account", "This account has activity. Deactivate it instead." Those arrive on
// ApiError.message through apiRequest and are handed straight to the page.
// Nothing here paraphrases them: the server is the only thing that knows which
// of the three applies, and a client-side guess would drift the first time one
// of those rules changes.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api";
import { queryKeys } from "../queryClient";

/**
 * Whether an account can still be hard-deleted.
 *
 * `last_login_at` is the proxy for "has never acted": signing in is what writes
 * an account's first audit row, and adminUsersController refuses the delete for
 * any account with audit rows. So a never-signed-in account is deletable and
 * everything else is not.
 *
 * It is a proxy and not the query itself, deliberately. The exact answer lives
 * in audit_log, and utils/audit.js keeps that table to a single reader —
 * countActorEvents exists so the delete handler does not have to open a second
 * one. Adding a has_activity column to this list endpoint would open a third.
 *
 * The one case the proxy misses is an account that only ever failed to sign in:
 * auth.login_failed writes a row without stamping last_login_at, so the UI
 * offers Delete and the server answers 409 with its own sentence, which the
 * dialog shows. Wrong-but-recoverable, in the direction that costs a round trip
 * rather than a lost account.
 */
export const canDelete = (user) => !user?.last_login_at;

export const useAdminUsers = () => {
  const queryClient = useQueryClient();
  const key = queryKeys.adminUsers();

  const {
    data: users = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiRequest("/admin/users", { signal }),
    staleTime: 0,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMutation = useMutation({
    mutationFn: (user) => apiRequest("/admin/users", { method: "POST", body: user }),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }) =>
      apiRequest(`/admin/users/${id}`, { method: "PUT", body: updates }),
    onSuccess: invalidate,
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, active }) =>
      apiRequest(`/admin/users/${id}/${active ? "reactivate" : "deactivate"}`, {
        method: "POST",
      }),
    onSuccess: invalidate,
  });

  const shopsMutation = useMutation({
    mutationFn: ({ id, shopIds }) =>
      apiRequest(`/admin/users/${id}/shops`, {
        method: "PUT",
        body: { shop_ids: shopIds },
      }),
    onSuccess: invalidate,
  });

  const passwordMutation = useMutation({
    mutationFn: ({ id, password }) =>
      apiRequest(`/admin/users/${id}/reset-password`, {
        method: "POST",
        body: { password },
      }),
    // must_change_password flips server-side, and the list shows it.
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiRequest(`/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const mutations = [
    createMutation,
    updateMutation,
    activeMutation,
    shopsMutation,
    passwordMutation,
    deleteMutation,
  ];

  const resetErrors = () => mutations.forEach((m) => m.reset());

  const run = async (mutation, args, context) => {
    resetErrors();
    try {
      await mutation.mutateAsync(args);
      return true;
    } catch (err) {
      console.error(context, err);
      return false;
    }
  };

  return {
    users,
    isLoading,
    error: error?.message ?? null,
    mutationError: mutations.find((m) => m.error)?.error?.message ?? null,
    isMutating: mutations.some((m) => m.isPending),
    resetErrors,

    createUser: (user) => run(createMutation, user, "Error creating user:"),
    updateUser: (id, updates) =>
      run(updateMutation, { id, updates }, "Error updating user:"),
    setUserActive: (id, active) =>
      run(activeMutation, { id, active }, "Error changing user status:"),
    setUserShops: (id, shopIds) =>
      run(shopsMutation, { id, shopIds }, "Error assigning shops:"),
    resetPassword: (id, password) =>
      run(passwordMutation, { id, password }, "Error resetting password:"),
    deleteUser: (id) => run(deleteMutation, id, "Error deleting user:"),
  };
};
