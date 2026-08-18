// hooks/usePaymentMethods.js
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api";
import { queryKeys, staleTimes } from "../queryClient";

/**
 * The payment methods the pay dialog offers and the reports label sales by.
 *
 * The list used to be two hardcoded <option> tags, so a new method meant a
 * redeploy. Same shape as useServices: edited rarely, read on every payment,
 * so it carries the same long staleTime and is restored from disk at boot.
 *
 * Inactive rows are included — reports need their labels to render historical
 * sales — so consumers that offer a choice should read `activeMethods`.
 */
export const usePaymentMethods = () => {
  const queryClient = useQueryClient();

  const {
    data: paymentMethods = [],
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: queryKeys.paymentMethods,
    queryFn: ({ signal }) => apiRequest("/payment-methods", { signal }),
    staleTime: staleTimes.paymentMethods,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods });

  const createMutation = useMutation({
    mutationFn: (method) =>
      apiRequest("/payment-methods", { method: "POST", body: method }),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }) =>
      apiRequest(`/payment-methods/${id}`, { method: "PUT", body: updates }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) =>
      apiRequest(`/payment-methods/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  /**
   * Optimistic on purpose: reordering is a rapid sequence of ▲/▼ taps, and
   * waiting a round trip per tap makes the row visibly lag behind the finger.
   * The server renumbers 1..N and returns the result, so onSettled reconciles.
   */
  const reorderMutation = useMutation({
    mutationFn: (orderedIds) =>
      apiRequest("/payment-methods/reorder", {
        method: "POST",
        body: { orderedIds },
      }),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.paymentMethods });
      const previous = queryClient.getQueryData(queryKeys.paymentMethods);

      if (Array.isArray(previous)) {
        const byId = new Map(previous.map((method) => [method.id, method]));
        const next = orderedIds.map((id) => byId.get(id)).filter(Boolean);
        // Anything the caller left out keeps its place at the end rather than
        // vanishing from the list mid-flight.
        const missing = previous.filter((m) => !orderedIds.includes(m.id));
        queryClient.setQueryData(queryKeys.paymentMethods, [...next, ...missing]);
      }

      return { previous };
    },
    onError: (_err, _orderedIds, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.paymentMethods, context.previous);
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
   * Clears every mutation's retained error before the next attempt, so a failed
   * delete cannot keep the banner up through a later successful edit.
   */
  const resetErrors = () => mutations.forEach((m) => m.reset());

  const createPaymentMethod = async (method) => {
    resetErrors();
    try {
      await createMutation.mutateAsync(method);
      return true;
    } catch (err) {
      console.error("Error creating payment method:", err);
      return false;
    }
  };

  const updatePaymentMethod = async (id, updates) => {
    resetErrors();
    try {
      await updateMutation.mutateAsync({ id, updates });
      return true;
    } catch (err) {
      console.error("Error updating payment method:", err);
      return false;
    }
  };

  const deletePaymentMethod = async (id) => {
    resetErrors();
    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch (err) {
      console.error("Error deleting payment method:", err);
      return false;
    }
  };

  /** @param {number[]} orderedIds every method id, in its new display order */
  const reorderPaymentMethods = async (orderedIds) => {
    resetErrors();
    try {
      await reorderMutation.mutateAsync(orderedIds);
      return true;
    } catch (err) {
      console.error("Error reordering payment methods:", err);
      return false;
    }
  };

  /** What the pay dialog offers: retired methods stay readable but unpickable. */
  const activeMethods = useMemo(
    () => paymentMethods.filter((m) => m.is_active),
    [paymentMethods]
  );

  return {
    paymentMethods,
    activeMethods,
    isLoading,
    isFetching,
    error: error?.message ?? null,
    mutationError: mutations.find((m) => m.error)?.error?.message ?? null,
    isMutating: mutations.some((m) => m.isPending),
    createPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    reorderPaymentMethods,
  };
};
