// pages/AdminAudit.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuditLog } from "../hooks/useAuditLog";
import { useAdminShops, shopsById } from "../hooks/useAdminShops";
import { useAdminUsers } from "../hooks/useAdminUsers";
import AuditFilters from "../components/admin/AuditFilters";
import AuditList from "../components/admin/AuditList";
import { todayISODate } from "../utils/dateRange";
import { MAX_AUDIT_LIMIT } from "../utils/auditFilters";

/**
 * One page of the walk.
 *
 * A component per cursor rather than one hook accumulating rows in state: each
 * page is then its own query key, "Load more" is a mount rather than a refetch,
 * and a page already fetched is not re-requested when a later one arrives.
 *
 * It reports its `next_cursor` and the range's action list upward. The parent
 * cannot read them any other way — they arrive with the response, and the last
 * page loaded is the only one that knows whether there is another.
 *
 * Every state this page can be in is rendered HERE rather than by the parent,
 * and that is load-bearing. The parent decided the empty case once, from the
 * count reported upward — but a page reports zero while it is still loading, so
 * the parent switched to its empty message and unmounted the very component
 * that was mid-fetch, which left the count at zero forever. A log with rows in
 * it rendered as "No activity in this range."
 *
 * Anything conditional on what a child reports must not be able to unmount that
 * child. Keeping loading, error and empty inside the page makes that structural.
 */
const AuditPage = ({ index, filters, shopsById: byId, onLoaded }) => {
  const { events, nextCursor, actions, isLoading, error } = useAuditLog(filters);

  useEffect(() => {
    onLoaded(index, {
      actions,
      nextCursor,
      count: events.length,
      // Distinguishes "no rows" from "no rows yet", so the counter does not read
      // 0 while the first page is still in flight.
      settled: !isLoading && !error,
    });
  }, [index, actions, nextCursor, events.length, isLoading, error, onLoaded]);

  if (isLoading) {
    return (
      <p className="py-6 text-center text-gray-500 dark:text-gray-400 animate-pulse">
        Loading events…
      </p>
    );
  }

  // Its own branch, and never folded into the empty message. A failed read
  // reported as "no activity" is the worst answer this screen can give: it is
  // indistinguishable from a clean range, and it is wrong.
  if (error) {
    return (
      <p role="alert" className="py-6 text-center text-red-700 dark:text-red-300">
        {error}
      </p>
    );
  }

  if (events.length === 0) {
    return index === 0 ? (
      <p className="text-gray-500 dark:text-gray-400 text-center italic py-8">
        No activity in this range.
      </p>
    ) : null;
  }

  return <AuditList events={events} shopsById={byId} />;
};

const initialFilters = () => {
  const today = todayISODate();
  // Today, and nothing wider. There is no "all time" option anywhere on this
  // screen — see the endpoint's own reasoning in backend/controllers/auditController.js.
  return { from: today, to: today, shopId: "", actorId: "", action: "" };
};

/**
 * Who did what, and when.
 *
 * The one screen in this app where making the UI more convenient would undo a
 * deliberate backend constraint. No auto-refresh, no polling, no prefetch of the
 * next page, no total count, no "all time" — audit_log grows without bound and
 * is read a handful of times a year, and every one of those conveniences would
 * be paid for by the database later.
 *
 * None of it is persisted either: `auditLog` is absent from PERSISTED_RESOURCES,
 * so nothing here is written to localStorage and a reload starts clean.
 */
const AdminAudit = () => {
  const [filters, setFilters] = useState(initialFilters);
  // The walk: one entry per page loaded, holding the cursor that fetched it.
  const [cursors, setCursors] = useState([null]);
  const [pageInfo, setPageInfo] = useState({});

  const { shops } = useAdminShops();
  const { users } = useAdminUsers();
  const byId = useMemo(() => shopsById(shops), [shops]);

  const handleLoaded = useCallback((index, info) => {
    setPageInfo((prev) => {
      const existing = prev[index];
      if (
        existing &&
        existing.nextCursor === info.nextCursor &&
        existing.actions === info.actions &&
        existing.count === info.count &&
        existing.settled === info.settled
      ) {
        return prev;
      }
      return { ...prev, [index]: info };
    });
  }, []);

  /** Any change to what is being asked restarts the walk from page one. */
  const changeFilters = (next) => {
    setFilters(next);
    setCursors([null]);
    setPageInfo({});
  };

  const first = pageInfo[0];
  const last = pageInfo[cursors.length - 1];

  const loadMore = () => {
    if (last?.nextCursor) setCursors([...cursors, last.nextCursor]);
  };

  const loadedCount = Object.values(pageInfo).reduce(
    (sum, page) => sum + (page.settled ? page.count : 0),
    0
  );
  const isLoadingFirst = Boolean(first) && !first.settled;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-5 text-gray-800 dark:text-gray-100">
        Audit Log
      </h1>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 mb-6 transition-colors space-y-4">
        <AuditFilters
          filters={filters}
          onChange={changeFilters}
          shops={shops}
          users={users}
          actions={first?.actions ?? []}
        />

        <div className="pt-1 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 pt-3">
            {/* "Loaded", not "found". There is no count of the range — counting
                rows in an unbounded table is the query this whole design
                avoids — so the number shown is only what has been fetched. */}
            <span className="font-semibold text-gray-800 dark:text-gray-100">
              {isLoadingFirst
                ? "Loading…"
                : `${loadedCount} ${loadedCount === 1 ? "event" : "events"} loaded`}
            </span>
            {" · "}
            {MAX_AUDIT_LIMIT} per page
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 sm:p-6 transition-colors">
        {/* Unconditional, deliberately. Each page renders its own loading,
            error and empty state; the parent must never wrap these in a
            condition derived from what they report, because that lets a page
            still in flight remove itself before its data lands. */}
        <div className="space-y-3">
          {cursors.map((cursor, index) => (
            <AuditPage
              key={cursor ?? "first"}
              index={index}
              filters={{ ...filters, cursor, limit: MAX_AUDIT_LIMIT }}
              shopsById={byId}
              onLoaded={handleLoaded}
            />
          ))}
        </div>

        {/* A cursor, not a page number. Numbered pages would need a total, and
            counting an append-only table that grows forever is exactly the
            query the endpoint's keyset pagination exists to avoid. */}
        {last?.nextCursor && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              className="px-6 min-h-11 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAudit;
