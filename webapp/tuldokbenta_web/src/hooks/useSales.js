// hooks/useSales.js
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api";
import { queryKeys, staleTimes } from "../queryClient";
import { dayRange, rangeBounds } from "../utils/dateRange";
import { useActiveShopId } from "./useActiveShop";

/**
 * Sales reads, split by what each page actually renders.
 *
 * The single useSales() this replaced fetched open sales, the whole closed-sales
 * table and today's closed sales together on every call, so pages paid for lists
 * they never showed — and every mutation re-ran all three.
 *
 * Each hook reads the active shop itself. Every page call site is therefore
 * unchanged by multi-shop, and no call site can forget the shop.
 */

/** Open sales. Read by the Open Sales page and Reporting. */
export const useOpenSales = () => {
  const shopId = useActiveShopId();

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: queryKeys.openSales(shopId),
    queryFn: ({ signal }) => apiRequest("/open-sales", { signal }),
    staleTime: staleTimes.sales,
    enabled: Boolean(shopId),
  });

  return {
    openSales: data ?? [],
    isLoading,
    isFetching,
    error: error?.message ?? null,
  };
};

/**
 * A preview of the number the next sale will get, for the cart to display.
 *
 * This replaces the client-side generator that produced the same string by
 * downloading every open *and* closed sale and taking the maximum — the whole
 * closed-sales table, on every visit to the page, for one integer.
 *
 * It's a preview, not a reservation: the server allocates the real number when the
 * sale is posted, so a second cashier checking out first simply moves this on. That
 * was equally true of the old client-side version, and is now handled rather than
 * rejected — see createOpenSale in the controller.
 */
export const useNextInvoice = () => {
  const shopId = useActiveShopId();

  const { data, isLoading, error } = useQuery({
    // Scoped like every other key, and load-bearing here rather than merely
    // consistent: invoice series run per shop, so two shops previewing the same
    // number at the same time is correct, and one shop showing the other's
    // preview would put a duplicate-looking number in front of a cashier.
    queryKey: queryKeys.nextInvoice(shopId),
    queryFn: ({ signal }) => apiRequest("/next-invoice", { signal }),
    staleTime: staleTimes.sales,
    enabled: Boolean(shopId),
  });

  return {
    nextInvoice: data?.invoice_number ?? null,
    isLoading,
    error: error?.message ?? null,
  };
};

/**
 * Note: there is deliberately no hook for the unbounded `/closed-sales`. Its only
 * caller was that invoice-number generator. Reporting uses the bounded windows below.
 */

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
  const shopId = useActiveShopId();

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: queryKeys.closedSalesDay(shopId, isoDate),
    queryFn: ({ signal }) => {
      const { lowdate, highdate } = dayRange(isoDate);
      return apiRequest(
        `/closed-sales?lowdate=${lowdate}&highdate=${highdate}`,
        { signal }
      );
    },
    staleTime: staleTimes.sales,
    enabled: Boolean(isoDate && shopId),
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
  const shopId = useActiveShopId();

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: queryKeys.closedSalesWindow(shopId, from, to),
    queryFn: ({ signal }) => {
      const { lowdate, highdate } = rangeBounds(from, to);
      return apiRequest(
        `/closed-sales?paidlow=${lowdate}&createdhigh=${highdate}`,
        { signal }
      );
    },
    staleTime: staleTimes.sales,
    enabled: Boolean(from && to && shopId),
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
 * Every mutation resolves to { ok, message, data } rather than throwing, because that
 * is the contract the cart, edit modal and offline queue already report from. `data`
 * is the server's response body — createOpenSale's callers read the allocated
 * invoice number back out of it.
 */
export const useSaleMutations = () => {
  const queryClient = useQueryClient();
  // The same shop the reads above are keyed by. An invalidation naming a
  // different shop than the query it is meant to clear would leave the list on
  // screen untouched after a sale — which is precisely the bug the one-place
  // queryKeys map exists to make impossible.
  const shopId = useActiveShopId();

  const invalidate = (keys) =>
    Promise.all(
      keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
    );

  // nextInvoice rides along: opening a sale consumes a number, and deleting the
  // newest one frees it again, so the cart's preview has to move with both.
  const openSalesAndStock = () =>
    invalidate([
      queryKeys.openSales(shopId),
      queryKeys.inventory(shopId),
      queryKeys.nextInvoice(shopId),
    ]);

  /** Moves a row between open and closed; stock was settled when it opened. */
  const bothSaleTables = () =>
    invalidate([queryKeys.openSales(shopId), queryKeys.closedSales(shopId)]);

  const run = async (mutation, args, fallbackMessage) => {
    try {
      const data = await mutation.mutateAsync(args);
      return { ok: true, message: null, data };
    } catch (err) {
      console.error(fallbackMessage, err);
      return { ok: false, message: err?.message || fallbackMessage, data: null };
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

  // Customer name and payment method — the endpoint refuses to touch the lines,
  // so no stock moved and the inventory cache stays good. The ["closedSales"]
  // prefix covers the day view, the report window and the full table at once,
  // which is what a changed method needs: it moves a peso value between the
  // report's payment buckets.
  //
  // `patch` is passed through rather than destructured so an absent key stays
  // absent — the server reads that as "leave it alone".
  const updateClosedMutation = useMutation({
    mutationFn: ({ id, patch }) =>
      apiRequest(`/closed-sales/${id}`, { method: "PUT", body: patch }),
    onSuccess: () => invalidate([queryKeys.closedSales(shopId)]),
  });

  const deleteClosedMutation = useMutation({
    mutationFn: (id) => apiRequest(`/closed-sales/${id}`, { method: "DELETE" }),
    // nextInvoice too: deleting the highest-numbered sale on file frees that number.
    onSuccess: () =>
      invalidate([queryKeys.closedSales(shopId), queryKeys.nextInvoice(shopId)]),
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
    /** @param {{customer_name?: string, paid_using?: string}} patch */
    updateClosedSale: (id, patch) =>
      run(updateClosedMutation, { id, patch }, "Failed to update closed sale"),
    deleteClosedSale: (id) =>
      run(deleteClosedMutation, id, "Failed to delete closed sale"),
  };
};
