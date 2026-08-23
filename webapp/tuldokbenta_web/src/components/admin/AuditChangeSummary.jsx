// components/admin/AuditChangeSummary.jsx
import { summarizeChanges } from "../../utils/auditChanges";

/**
 * What actually changed, in a form a person can read.
 *
 * All the judgement lives in summarizeChanges, which is pure and tested against
 * arbitrary input; this component only renders the four shapes it can return.
 * That split is what makes "never blanks the screen on an unfamiliar payload" a
 * property rather than a hope — the JSON fallback is a branch here, not an
 * error boundary somewhere above.
 */
const AuditChangeSummary = ({ changes }) => {
  const summary = summarizeChanges(changes);

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
            <dd className="text-gray-800 dark:text-gray-100 break-all">
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
