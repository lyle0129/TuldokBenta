// controllers/auditController.js
// The only reader of audit_log, anywhere in the system.
//
// Every restriction below exists for one reason: this table grows without bound
// and is read a handful of times a year. A convenient unbounded read of a table
// that grows forever is a production incident with a long fuse — it works fine
// for a year and then one query ties up the database on a Saturday. So the
// endpoint is deliberately awkward: a date range is mandatory, the page size is
// capped, and pagination is by keyset rather than OFFSET.
//
// Do not add a second reader. If a later feature wants audit data, it should
// call this, not write its own query.

import { sql } from "../config/db.js";

/** Above this, a page stops being a page. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

/** Absent, blank or whitespace-only means "no filter" — the idiom from getClosedSales. */
const bound = (value) => {
  const trimmed = typeof value === "string" ? value.trim() : value;
  return trimmed ? trimmed : null;
};

/** A positive integer, or null. Used for the two id filters. */
const idFilter = (value) => {
  const raw = bound(value);
  if (raw === null) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * The last row of the previous page, as an opaque `occurred_at|id` string.
 *
 * Opaque to the client, which should only ever echo back what it was given.
 * Returns `undefined` for a malformed cursor so the caller can tell "no cursor"
 * (null) from "a cursor I could not read" (400) — silently ignoring a bad one
 * would restart the walk at page 1 and duplicate every row the client has.
 */
const parseCursor = (raw) => {
  if (!raw) return null;

  const separator = String(raw).lastIndexOf("|");
  if (separator <= 0) return undefined;

  const occurredAt = String(raw).slice(0, separator);
  const id = Number(String(raw).slice(separator + 1));

  if (!Number.isInteger(id) || id <= 0) return undefined;
  if (Number.isNaN(Date.parse(occurredAt))) return undefined;

  return { occurredAt, id };
};

// GET /api/admin/audit
export const getAuditLog = async (req, res) => {
  try {
    const { from, to, shop_id, actor_id, action, entity_type, cursor } = req.query;

    // Required, and pointedly not defaulted. "All time" on a table like this is
    // not a convenience anybody needs and is the one query that could hurt.
    const rangeFrom = bound(from);
    const rangeTo = bound(to);
    if (!rangeFrom || !rangeTo) {
      return res.status(400).json({ message: "A date range is required" });
    }
    if (Number.isNaN(Date.parse(rangeFrom)) || Number.isNaN(Date.parse(rangeTo))) {
      return res.status(400).json({ message: "A date range is required" });
    }

    const page = parseCursor(cursor);
    if (page === undefined) {
      return res.status(400).json({ message: "Invalid pagination cursor" });
    }

    // Clamped rather than refused: a client asking for 5000 gets 100 and a full
    // cursor, which is the same data one page at a time.
    const requested = Number(bound(req.query.limit));
    const limit = Number.isInteger(requested) && requested > 0
      ? Math.min(requested, MAX_LIMIT)
      : DEFAULT_LIMIT;

    const shopId = idFilter(shop_id);
    const actorId = idFilter(actor_id);
    const actionFilter = bound(action);
    const entityType = bound(entity_type);
    const cursorAt = page?.occurredAt ?? null;
    const cursorId = page?.id ?? null;

    // One flat template with NULL-tolerant bounds rather than composed SQL
    // fragments — the pattern closedSalesController.getClosedSales uses. A NULL
    // filter drops its own condition, so every combination is handled without
    // ever building a string, and no column name can come from the query.
    //
    // The actor snapshot is read straight off the row. No join to users or
    // shops, ever: the snapshot is the point, and a join here would be the
    // thing that makes this query expensive as the table grows.
    const rows = sql`
      SELECT id, occurred_at, actor_user_id, actor_username, actor_role,
             shop_id, action, entity_type, entity_id, entity_label,
             changes, ip_address
        FROM audit_log
       WHERE occurred_at >= ${rangeFrom}::timestamp
         AND occurred_at <  ${rangeTo}::timestamp
         AND (${shopId}::int       IS NULL OR shop_id       = ${shopId}::int)
         AND (${actorId}::int      IS NULL OR actor_user_id = ${actorId}::int)
         AND (${actionFilter}::text IS NULL OR action       = ${actionFilter}::text)
         AND (${entityType}::text  IS NULL OR entity_type   = ${entityType}::text)
         -- Keyset, never OFFSET. The row-value comparison seeks straight into
         -- the (shop_id, occurred_at DESC) index; OFFSET 10000 would make
         -- Postgres walk and discard ten thousand rows first. On a table
         -- designed to grow forever that is the difference between a page that
         -- costs the same every day and one that degrades every day.
         AND (${cursorAt}::timestamp IS NULL
              OR (occurred_at, id) < (${cursorAt}::timestamp, ${cursorId}::bigint))
       ORDER BY occurred_at DESC, id DESC
       LIMIT ${limit}
    `;

    // The distinct actions present in this range, so the client can build its
    // filter dropdown without a second table to maintain — and without the
    // frontend hardcoding a copy of the ACTIONS vocabulary that drifts.
    // Deliberately not filtered by the other predicates: a filter list that
    // only shows what you already selected is useless.
    const actions = sql`
      SELECT DISTINCT action FROM audit_log
       WHERE occurred_at >= ${rangeFrom}::timestamp
         AND occurred_at <  ${rangeTo}::timestamp
       ORDER BY action ASC
    `;

    const [events, actionRows] = await Promise.all([rows, actions]);

    // A full page gets a cursor; a short one is the end of the walk, and
    // returning null there is what tells the client to stop asking.
    const last = events[events.length - 1];
    const nextCursor =
      events.length === limit && last ? `${toIsoLike(last.occurred_at)}|${last.id}` : null;

    res.status(200).json({
      events,
      next_cursor: nextCursor,
      actions: actionRows.map((row) => row.action),
    });
  } catch (error) {
    console.error("Error reading the audit log", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * The timestamp in a form Postgres will cast back to exactly this row.
 *
 * A Date's toISOString() is UTC with a `Z`, and these columns are `TIMESTAMP`
 * without a zone — casting that back shifts the value by the offset and the
 * next page either skips rows or repeats them. Sending the plain
 * `YYYY-MM-DD HH:MM:SS.mmm` keeps the comparison in the same frame the column
 * is stored in. See config/timezone.js for why the process runs pinned.
 */
const toIsoLike = (value) => {
  if (typeof value === "string") return value;
  const date = value instanceof Date ? value : new Date(value);
  const pad = (n, width = 2) => String(n).padStart(width, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.` +
    `${pad(date.getMilliseconds(), 3)}`
  );
};
