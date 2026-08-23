// hooks/useAuditLog.js
// One page of the audit log.
//
// Four of the options below are deliberate departures from how every other
// query in this app is configured, and each one is holding up a backend
// decision rather than a preference:
//
//   enabled              Requirement 4.1 made structural. There is no code path
//                        that can issue an audit request without both ends of a
//                        range, because the query simply does not run.
//   refetchOnWindowFocus The app-wide default is `true`, which is right for the
//                        till — another cashier's changes matter there. It is
//                        wrong for an append-only log that costs a scan to read
//                        and that nobody is waiting on.
//   gcTime               The app-wide default is 24 hours. Paging through a
//                        long range would otherwise hold every page in memory
//                        for a day.
//   no prefetch          Tempting, and it would exactly double the cost of a
//                        screen opened a few times a year.
//
// The endpoint is the only reader of a table designed to grow forever. Every
// convenience added here is paid for by the database on a Saturday in three
// years' time.

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../api";
import { queryKeys } from "../queryClient";
import { buildAuditParams, hasRange } from "../utils/auditFilters";

/** Short enough that a walk through a month does not accumulate in memory. */
const AUDIT_GC_TIME = 5 * 60 * 1000;

const EMPTY_ACTIONS = [];
const EMPTY_EVENTS = [];

/**
 * @param {{from: string, to: string, shopId?: string, actorId?: string,
 *          action?: string, cursor?: string}} filters
 */
export const useAuditLog = (filters) => {
  const enabled = hasRange(filters);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: queryKeys.auditLog(filters),
    queryFn: ({ signal }) =>
      apiRequest(`/admin/audit?${buildAuditParams(filters)}`, { signal }),
    enabled,
    staleTime: 0,
    gcTime: AUDIT_GC_TIME,
    refetchOnWindowFocus: false,
  });

  return {
    events: data?.events ?? EMPTY_EVENTS,
    // Null is the end of the walk: getAuditLog returns a cursor only for a full
    // page, so a short one stops the client asking rather than looping on an
    // empty result.
    nextCursor: data?.next_cursor ?? null,
    // The distinct actions present in the range, which is what the filter
    // dropdown is built from — never a constant copy of the backend's ACTIONS
    // vocabulary, which would drift and would offer actions that never
    // happened in the range on screen.
    actions: data?.actions ?? EMPTY_ACTIONS,
    isLoading: enabled && isLoading,
    isFetching,
    error: error?.message ?? null,
  };
};
