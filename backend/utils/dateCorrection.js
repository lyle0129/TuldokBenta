// utils/dateCorrection.js
// The rules for moving a sale's encoded dates, with no database and no request
// in sight.
//
// Pure in the same sense as saleItems.js and passwords.js, and for the same
// reason: this is the one operation in the system that rewrites history.
// Reports bucket on created_at and paid_at, so a correction silently changes
// what past months say — which is the intended feature, and exactly why the
// rules deciding whether one is allowed have to be testable exhaustively rather
// than by clicking through a UI.
//
// The properties this file exists to make checkable:
//
//   P1  the verdict depends only on the RESULTING pair, never on which of the
//       two fields the request happened to submit
//   P2  an accepted correction never leaves paid_at earlier than created_at
//   P3  the table allowlist is closed — anything that is not exactly "open" or
//       "closed" resolves to null, before any query is built

/**
 * The two sale tables, and the only mapping from a URL segment to one.
 *
 * Exported so the controller can name a table without ever building the name
 * from input. A neon tagged template cannot parameterise an identifier, so a
 * table name assembled from `req.params` would be string interpolation into
 * SQL — the one place in this ticket where a naive implementation is an
 * injection.
 */
export const SALE_TABLES = Object.freeze({
  open: "open_sales",
  closed: "closed_sales",
});

/**
 * "open" | "closed" for exactly those two strings, and `null` for everything
 * else — including "OPEN", " open", "open_sales" and "users".
 *
 * Deliberately not case-insensitive and not trimmed. This is an allowlist over
 * a fixed pair of literals, not a parser, and every liberty taken here is a
 * liberty taken with the thing that decides which table a statement touches.
 */
export const resolveSaleType = (table) =>
  table === "open" || table === "closed" ? table : null;

/** How far ahead of now a corrected date may still land. */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

const invalid = (message) => ({ error: { status: 400, message } });

/**
 * A timestamp in the form these columns actually hold.
 *
 * `YYYY-MM-DD HH:MM:SS.mmm`, read out of the local frame — which config/
 * timezone.js pins to UTC, matching what the bare TIMESTAMP columns store. A
 * Date's toISOString() would append a `Z`, and Postgres casting that into a
 * zone-less column drops the marker rather than converting, so a value round
 * trips through here unchanged while `toISOString()` would shift it by the
 * host's offset. auditController.js has the same helper for its cursor, and for
 * the same reason.
 *
 * Normalising both sides also means the audit row's before and after read in
 * one format instead of one Date and one whatever-the-client-sent.
 */
export const toTimestampText = (value) => {
  if (value === null || value === undefined) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const pad = (n, width = 2) => String(n).padStart(width, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.` +
    `${pad(date.getMilliseconds(), 3)}`
  );
};

/** Milliseconds for a stored or submitted value, or null for "not there". */
const instant = (value) => {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

/** A submitted value that means "clear this column". */
const isBlank = (value) =>
  value === null || (typeof value === "string" && value.trim() === "");

/**
 * Decides a correction and produces exactly what to write.
 *
 * @param {object} args
 * @param {{created_at: any, paid_at: any}} args.current the row as it stands
 * @param {object} args.patch the request body — either date may be absent
 * @param {"open"|"closed"} args.saleType which table the row is in
 * @param {number} [args.now] injectable clock, so the future rule is testable
 * @returns {{error: {status: number, message: string}}
 *          | {next: {created_at: string, paid_at: string|null},
 *             set: {created_at?: string, paid_at?: string|null}}}
 *
 * `set` carries only the fields the request actually submitted, so an omitted
 * column is never written at all — which is what "SHALL leave an omitted field
 * untouched" means when the alternative is writing back a value we just read.
 * `next` is the full resulting pair, for the audit row's `after`.
 */
export const planDateCorrection = ({ current, patch, saleType, now = Date.now() }) => {
  const submitted = patch ?? {};
  const hasCreated = Object.hasOwn(submitted, "created_at");
  const hasPaid = Object.hasOwn(submitted, "paid_at");

  if (!hasCreated && !hasPaid) {
    return invalid("Send created_at, paid_at, or both");
  }

  // An open sale has no meaningful paid_at: paySale moves the row into
  // closed_sales rather than stamping the column, so it is NULL for every row
  // that is legitimately open. Refusing the key outright is honest about that;
  // accepting it would let an admin write a value nothing reads and no report
  // would ever show.
  if (saleType === "open" && hasPaid) {
    return invalid("An open sale has no payment date to correct");
  }

  const set = {};

  if (hasCreated) {
    if (isBlank(submitted.created_at)) {
      return invalid("A sale must keep a creation date");
    }
    const text = toTimestampText(submitted.created_at);
    if (text === null) return invalid("That creation date could not be read");
    set.created_at = text;
  }

  if (hasPaid) {
    if (isBlank(submitted.paid_at)) {
      // Only reachable for a closed sale — the open case returned above. Its
      // paid_at is NOT NULL in the schema, so this would be a 500 from the
      // database rather than an answer anybody could act on.
      return invalid("A paid sale must keep a payment date");
    }
    const text = toTimestampText(submitted.paid_at);
    if (text === null) return invalid("That payment date could not be read");
    set.paid_at = text;
  }

  // From here on nothing looks at what was submitted — only at what the row
  // would end up holding. That is P1, and it is what stops "correct paid_at
  // alone" and "resubmit created_at unchanged as well" from disagreeing.
  const next = {
    created_at: hasCreated ? set.created_at : toTimestampText(current?.created_at),
    paid_at: hasPaid ? set.paid_at : toTimestampText(current?.paid_at),
  };

  const createdMs = instant(next.created_at);
  const paidMs = instant(next.paid_at);

  if (createdMs === null) {
    return invalid("A sale must keep a creation date");
  }

  // A day of tolerance rather than none: a till clock that is a few hours fast
  // is a real thing, and the value being guarded against is a typo in the year.
  const horizon = now + FUTURE_TOLERANCE_MS;
  if (createdMs > horizon || (paidMs !== null && paidMs > horizon)) {
    return invalid("That date is in the future");
  }

  if (saleType === "closed" && paidMs === null) {
    return invalid("A paid sale must keep a payment date");
  }

  if (paidMs !== null && paidMs < createdMs) {
    return invalid("A sale cannot be paid before it was created");
  }

  return { next, set };
};
