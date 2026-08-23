// utils/auditFilters.js
// Turns the audit viewer's filter state into the query string the endpoint
// wants, with no React and no fetch in sight.
//
// Pure for the same reason utils/dateRange.js and utils/buildSaleItems.js are:
// the two properties this file has to hold are properties of a *string*, and
// checking them through a rendered component would mean checking them once,
// against whatever the component happened to be doing that day.
//
//   P1  no request is ever built without both ends of a range
//   P2  the limit in the built string is never above 100
//
// Both exist to keep a deliberately awkward backend awkward. auditController.js
// caps the page at 100 and refuses a missing range outright, and the temptation
// on this side is always to paper over that — a default range of "everything",
// a limit raised because a page felt short. The endpoint is the one reader of a
// table designed to grow forever; the awkwardness is the feature.

import { rangeBounds, shiftDay } from "./dateRange";

/** The server's own cap, mirrored so the client never asks for more. */
export const MAX_AUDIT_LIMIT = 100;

/** What a page asks for when nothing says otherwise. */
export const DEFAULT_AUDIT_LIMIT = 100;

/** Trimmed text, or null for anything that means "no filter". */
const value = (raw) => {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * Whether these filters describe a range the endpoint would accept.
 *
 * The audit query is `enabled` on exactly this, which is what makes
 * Requirement 4.1 structural: there is no code path that can issue a request
 * without both bounds, rather than a rule everyone has to remember.
 *
 * Trimmed through the same `value` the query string uses, so the two cannot
 * disagree about what counts as present — a bound this said was there and that
 * one dropped would be a request the server answers with 400.
 */
export const hasRange = (filters) =>
  value(filters?.from) !== null && value(filters?.to) !== null;

/**
 * The two timestamps covering an inclusive span of local days.
 *
 * The endpoint compares `occurred_at >= from AND occurred_at < to`, so the
 * upper bound is the start of the day *after* `to` rather than that day's last
 * millisecond — an inclusive-looking bound against an exclusive comparison is
 * how the final second of the range goes missing.
 *
 * Both are built through rangeBounds, which converts a local midnight into the
 * UTC text the bare TIMESTAMP columns actually hold. The shop reads its log in
 * its own zone; the column is in UTC.
 */
const timestampsFor = (fromISO, toISO) => ({
  from: rangeBounds(fromISO, fromISO).lowdate,
  to: rangeBounds(shiftDay(toISO, 1), shiftDay(toISO, 1)).lowdate,
});

/**
 * The query string for one page of the audit log.
 *
 * @param {{from: string, to: string, shopId?: number|string,
 *          actorId?: number|string, action?: string, cursor?: string,
 *          limit?: number}} filters
 * @returns {string} e.g. "from=…&to=…&limit=100" — no leading "?"
 */
export const buildAuditParams = (filters = {}) => {
  const { from, to } = timestampsFor(filters.from, filters.to);

  const params = new URLSearchParams({ from, to });

  // Clamped rather than trusted. The server clamps too, and that is the point:
  // a client that quietly asks for 5000 and is quietly given 100 has a paging
  // bug nobody can see, because next_cursor is computed against the limit the
  // server used.
  const requested = Number(filters.limit);
  const limit =
    Number.isInteger(requested) && requested > 0 ? requested : DEFAULT_AUDIT_LIMIT;
  params.set("limit", String(Math.min(limit, MAX_AUDIT_LIMIT)));

  const shopId = value(filters.shopId);
  if (shopId) params.set("shop_id", shopId);

  const actorId = value(filters.actorId);
  if (actorId) params.set("actor_id", actorId);

  const action = value(filters.action);
  if (action) params.set("action", action);

  // Opaque: whatever the last response returned, echoed back untouched. A
  // cursor the server cannot read is a 400, not a silent restart from page one.
  const cursor = value(filters.cursor);
  if (cursor) params.set("cursor", cursor);

  return params.toString();
};
