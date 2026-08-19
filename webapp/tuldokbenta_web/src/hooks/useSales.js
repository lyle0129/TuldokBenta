// hooks/useSales.js
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api";
import { queryKeys, staleTimes } from "../queryClient";
import { dayRange, rangeBounds } from "../utils/dateRange";

/**
 * Sales reads, split by what each page actually renders.
 *
 * The single useSales() this replaced fetched open sales, the whole closed-sales
 * table and today's closed sales together on every call, so pages paid for lists
 * they never showed — and every mutation re-ran all three.
 */

/** Open sales. Read by the Open Sales page and Reporting. */
export const useOpenSales = () => {
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: queryKeys.openSales,
    queryFn: ({ signal }) => apiRequest("/open-sales", { signal }),
    staleTime: staleTimes.sales,
  });

  return {
    openSales: data ?? [],
    isLoading,
    isFetching,
    error: error?.message ?? null,
  };
};

/**
 * Every closed sale. Needed by Reporting (which filters client-side) and by the
 * Open Sales invoice-number generator, which needs the global maximum.
 *
 * Note this endpoint is unbounded — see the follow-up note in the plan. Caching
 * stops the repeat downloads but not the growth of the first one.
 */
export const useClosedSales = () => {
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: queryKeys.closedSalesAll,
    queryFn: ({ signal }) => apiRequest("/closed-sales", { signal }),
    staleTime: staleTimes.sales,
  });

  return {
    closedSales: data ?? [],
    isLoading,
    isFetching,
    error: error?.message ?? null,
  };
};

/**
 * One calendar day of closed sales, cached per day.
 *
 * Keying by the day is what fixes two things at once: revisiting a day is
 * instant, and a slow response for a day the user has already navigated away
 * from can no longer overwrite the day on screen.
 *
 * @param {string} isoDate "YYYY-MM-DD"
 */
export const useClosedSalesForDay = (isoDate) => {
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: queryKeys.closedSalesDay(isoDate),
    queryFn: ({ signal }) => {
      const { lowdate, highdate } = dayRange(isoDate);
      return apiRequest(
        `/closed-sales?lowdate=${lowdate}&highdate=${highdate}`,
        { signal }
      );
    },
    staleTime: staleTimes.sales,
    enabled: Boolean(isoDate),
  });

  return {
    closedSalesbyDate: data ?? [],
    isLoading,
    isFetching,
    error: error?.message ?? null,
  };
};

/**
 * Every closed sale the report needs for a range, in one request.
 *
 * The window is `created_at <= end AND paid_at >= start`, which is wider than
 * the range and deliberately so. Three different questions are answered by
 * filtering this one set:
 *
 *   collected     paid_at within the range
 *   booked        created_at within the range, paid or not
 *   owed on day D created_at <= D and not yet paid by D
 *
 * The last one is why the window cannot simply be the range. Knowing what was
 * owed on a past day means knowing which of those sales were paid *afterwards*,
 * so the set has to reach forward from the range's start to now. Sales settled
 * before the range begins are excluded by `paidlow`, since they cannot affect
 * any day inside it — and a sale can never be paid before it was created, so
 * nothing is missed at the other end.
 *
 * The cost is that a range from six months ago pulls six months of payments.
 * If that ever bites, the answer is a server-side aggregate, not a narrower
 * window: the arithmetic genuinely needs these rows.
 *
 * @param {string} from "YYYY-MM-DD", inclusive
 * @param {string} to   "YYYY-MM-DD", inclusive
 */
export const useClosedSalesWindow = (from, to) => {
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: queryKeys.closedSalesWindow(from, to),
    queryFn: ({ signal }) => {
      const { lowdate, highdate } = rangeBounds(from, to);
      return apiRequest(
        `/closed-sales?paidlow=${lowdate}&createdhigh=${highdate}`,
        { signal }
      );
    },
    staleTime: staleTimes.sales,
    enabled: Boolean(from && to),
  });

  return {
    closedSales: data ?? [],
    isLoading,
    isFetching,
    error: error?.message ?? null,
  };
};

/**
 * The seven sale mutations, each invalidating exactly what the server changed.
 *
 * The invalidation map is taken from the controllers, not guessed:
 * creating, editing and deleting an open sale move stock in the same
 * transaction (openSalesController.applyStockAndSale), while pay and revert
 * only move the row between tables and leave stock alone.
 *
 * Every mutation resolves to { ok, message } rather than throwing, because that
 * is the contract the cart, edit modal and offline queue already report from.
 */
export const useSaleMutations = () => {
  const queryClient = useQueryClient();

  const invalidate = (keys) =>
    Promise.all(
      keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
    );

  const openSalesAndStock = () =>
    invalidate([queryKeys.openSales, queryKeys.inventory]);

  /** Moves a row between open and closed; stock was settled when it opened. */
  const bothSaleTables = () =>
    invalidate([queryKeys.openSales, queryKeys.closedSales]);

  const run = async (mutation, args, fallbackMessage) => {
    try {
      await mutation.mutateAsync(args);
      return { ok: true, message: null };
    } catch (err) {
      console.error(fallbackMessage, err);
      return { ok: false, message: err?.message || fallbackMessage };
    }
  };

  const createMutation = useMutation({
    mutationFn: (sale) => apiRequest("/open-sales", { method: "POST", body: sale }),
    onSuccess: openSalesAndStock,
  });

  const updateMutation = useMutation({
    // Only `items` is read server-side, but sending the whole sale keeps this
    // callable with a row straight out of the list.
    mutationFn: ({ id, sale }) =>
      apiRequest(`/open-sales/${id}`, { method: "PUT", body: sale }),
    onSuccess: openSalesAndStock,
  });

  const deleteOpenMutation = useMutation({
    mutationFn: (id) => apiRequest(`/open-sales/${id}`, { method: "DELETE" }),
    onSuccess: openSalesAndStock,
  });

  const payMutation = useMutation({
    mutationFn: ({ id, paid_using }) =>
      apiRequest(`/pay-sale/${id}`, { method: "POST", body: { paid_using } }),
    onSuccess: bothSaleTables,
  });

  const revertMutation = useMutation({
    mutationFn: (id) => apiRequest(`/revert-sale/${id}`, { method: "POST" }),
    onSuccess: bothSaleTables,
  });

  // Customer name only — the endpoint refuses to touch anything else, so no
  // stock moved and the inventory cache stays good.
  const updateClosedMutation = useMutation({
    mutationFn: ({ id, customer_name }) =>
      apiRequest(`/closed-sales/${id}`, {
        method: "PUT",
        body: { customer_name },
      }),
    onSuccess: () => invalidate([queryKeys.closedSales]),
  });

  const deleteClosedMutation = useMutation({
    mutationFn: (id) => apiRequest(`/closed-sales/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidate([queryKeys.closedSales]),
  });

  return {
    createOpenSale: (sale) => run(createMutation, sale, "Failed to create open sale"),
    updateOpenSale: (id, sale) =>
      run(updateMutation, { id, sale }, "Failed to update open sale"),
    deleteOpenSale: (id) =>
      run(deleteOpenMutation, id, "Failed to delete open sale"),
    paySale: (id, paid_using) =>
      run(payMutation, { id, paid_using }, "Failed to pay sale"),
    revertSale: (id) => run(revertMutation, id, "Failed to revert sale"),
    updateClosedSale: (id, customer_name) =>
      run(
        updateClosedMutation,
        { id, customer_name },
        "Failed to update closed sale"
      ),
    deleteClosedSale: (id) =>
      run(deleteClosedMutation, id, "Failed to delete closed sale"),
  };
};
