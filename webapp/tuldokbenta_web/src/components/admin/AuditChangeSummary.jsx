// components/admin/AuditChangeSummary.jsx
import { summarizeChanges } from "../../utils/auditChanges";
import { formatCurrency } from "../../utils/format";

/** How many changed sale lines to show before collapsing the rest. */
const MAX_ITEM_LINES = 12;

/** A line's unit price, or "free" — freebie lines are genuinely priced at 0. */
const priceLabel = (value) => (Number(value) || 0) === 0 ? "free" : formatCurrency(value);

const BADGES = {
  added: {
    text: "Added",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  },
  removed: {
    text: "Removed",
    className: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  },
  qty: {
    text: "Changed",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  },
};

/**
 * One changed sale line, in words.
 *
 * "Added · Detergent Surf · 1 × ₱15.00" rather than the object it came from.
 * The quantity arrow only appears when the quantity is what moved, so a line
 * whose price was corrected does not also claim its count changed.
 */
const ItemLine = ({ item }) => {
  const badge = BADGES[item.change] ?? BADGES.qty;
  const qtyMoved = item.change === "qty" && item.qtyBefore !== item.qtyAfter;
  const priceMoved = item.change === "qty" && item.priceBefore !== item.priceAfter;

  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span
        className={`text-xs font-medium px-1.5 py-0.5 rounded ${badge.className}`}
      >
        {badge.text}
      </span>
      <span className="text-gray-800 dark:text-gray-100">{item.name}</span>
      <span className="text-gray-500 dark:text-gray-400">
        {qtyMoved ? `${item.qtyBefore} → ${item.qtyAfter}` : `x${item.qtyAfter || item.qtyBefore}`}
        {priceMoved
          ? ` · ${priceLabel(item.priceBefore)} → ${priceLabel(item.priceAfter)}`
          : ` · ${priceLabel(item.priceAfter)}`}
      </span>
    </li>
  );
};

/**
 * What actually changed, in a form a person can read.
 *
 * All the judgement lives in summarizeChanges, which is pure and tested against
 * arbitrary input; this component only renders the shapes it can return. That
 * split is what makes "never blanks the screen on an unfamiliar payload" a
 * property rather than a hope — the JSON fallback is a branch here, not an
 * error boundary somewhere above.
 *
 * `shopsById` is passed down only so a user's `shop_ids` can name its shops.
 * The summariser has no way to look them up and must not grow one.
 */
const AuditChangeSummary = ({ changes, shopsById }) => {
  const summary = summarizeChanges(changes, { shopsById });

  if (summary.kind === "none") return null;

  if (summary.kind === "text") {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{summary.text}</p>
    );
  }

  if (summary.kind === "lines") {
    return (
      <dl className="mt-2 space-y-0.5 text-sm">
        {summary.lines.map((line, i) => (
          <div key={i} className="flex flex-wrap gap-x-2">
            <dt className="text-gray-500 dark:text-gray-400 min-w-32">
              {line.field}
            </dt>

            {line.kind === "items" ? (
              // Its own block rather than a run of text: a sale can change five
              // lines at once, and five changes on one wrapped line is the blob
              // this component exists to stop rendering.
              <dd className="w-full sm:w-auto sm:flex-1 min-w-0">
                <ul className="space-y-0.5">
                  {line.items.slice(0, MAX_ITEM_LINES).map((item, j) => (
                    <ItemLine key={j} item={item} />
                  ))}
                </ul>
                {line.items.length > MAX_ITEM_LINES && (
                  <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                    +{line.items.length - MAX_ITEM_LINES} more
                  </p>
                )}
              </dd>
            ) : (
              <dd className="text-gray-800 dark:text-gray-100 break-words min-w-0">
                {line.before !== null && (
                  <>
                    <span className="text-gray-500 dark:text-gray-400 line-through">
                      {line.before}
                    </span>
                    <span aria-hidden="true" className="mx-1.5">
                      →
                    </span>
                  </>
                )}
                {line.after}
              </dd>
            )}
          </div>
        ))}
      </dl>
    );
  }

  // The shape the summariser did not recognise. Ugly on purpose and rare by
  // construction — showing the payload is what keeps an unfamiliar action
  // readable at all, and its ugliness is the nudge to teach the summariser
  // about it.
  return (
    <pre className="mt-2 text-xs overflow-x-auto rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-2 text-gray-700 dark:text-gray-300">
      {summary.text}
    </pre>
  );
};

export default AuditChangeSummary;
