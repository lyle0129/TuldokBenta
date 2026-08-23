// hooks/useCorrectSaleDates.js
// Moving the dates a sale was encoded with.
//
// The one mutation in the app that rewrites history: reports bucket on
// created_at and paid_at, so a correction changes what a past month says. That
// is the intended feature — R4 in the overview's risk register is about nobody
// being surprised by it, not about preventing it — and it is why the backend
// writes the audit row inside the same transaction as the update.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api";
import { queryKeys } from "../queryClient";

/**
 * A `datetime-local` value ("2026-08-24T14:30") as the API wants it.
 *
 * The input is read in the browser's own zone, matching what formatDateTime
 * prints on the card the admin is looking at, and sent as a real instant. The
 * backend re-reads it with its process pinned to UTC (config/timezone.js),
 * which is the frame the bare TIMESTAMP columns hold — so the instant the admin
 * picked is the instant that lands.
 *
 * @returns {string|null} an ISO instant, or null for an unreadable input
 */
export const toApiTimestamp = (localValue) => {
  if (!localValue) return null;
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * An instant from the API as a `datetime-local` input value.
 *
 * Local calendar fields, never toISOString().slice() — the latter would render
 * a UTC wall clock into a control the browser labels with the user's zone, and
 * the admin would "correct" a date that was already right.
 */
export const toInputValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
};

export const useCorrectSaleDates = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    /**
     * @param {{table: "open"|"closed", sale: object, patch: object}} args
     *   `patch` carries only the fields being changed — an absent key is left
     *   untouched server-side, and for an open sale `paid_at` must be absent
     *   entirely: planDateCorrection refuses the key outright, because
     *   open_sales.paid_at is NULL for every legitimately open row.
     */
    mutationFn: ({ table, sale, patch }) =>
      apiRequest(`/admin/sales/${table}/${sale.id}/dates`, {
        method: "PATCH",
        body: patch,
      }),
    onSuccess: (_data, { sale }) => {
      // The SALE's shop, not the active one. This surface reaches every shop —
      // the admin routes take their subject as a parameter and mount no
      // resolveShop — so a correction made while Shop 1 is selected can easily
      // belong to Shop 2, and invalidating the active shop's keys would leave
      // the corrected row stale in the only cache that holds it.
      const shopId = sale?.shop_id;
      if (!shopId) return;

      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.closedSales(shopId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.openSales(shopId) }),
      ]);
    },
  });

  /**
   * @returns {{ok: boolean, message: string|null}} the server's own message on
   *   refusal, so the dialog can show it and stay open.
   */
  const correctDates = async (table, sale, patch) => {
    mutation.reset();
    try {
      await mutation.mutateAsync({ table, sale, patch });
      return { ok: true, message: null };
    } catch (err) {
      console.error("Error correcting sale dates:", err);
      return { ok: false, message: err?.message || "Could not change the dates" };
    }
  };

  return { correctDates, isSaving: mutation.isPending };
};
