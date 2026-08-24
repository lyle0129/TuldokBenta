// components/shared/ReceiptPreview.jsx
import { useMemo } from "react";
import { buildReceiptDocument } from "../../utils/printInvoice";
import { SAMPLE_SALE } from "../../data/sampleReceipt";

/**
 * What this shop's receipts will look like.
 *
 * An iframe holding the real print document, not a React re-creation of it. Two
 * reasons, and both are the point of the component:
 *
 *  - It cannot drift. There is exactly one module that renders a receipt, and
 *    this is showing its output — a change to the printed layout shows up here
 *    for free, and a preview that disagrees with the printer is impossible.
 *  - The receipt document sets its own body width in millimetres and its own
 *    monospace font. Dropped into the page it would inherit Tailwind's reset and fight the
 *    surrounding layout; inside a frame it is its own document, exactly as it is
 *    when it opens in its own window.
 *
 * The Print button is left off: this is a preview, and the button belongs to the
 * popup that prints.
 *
 * @param {Object} shop  the receipt profile, in the same shape printInvoice takes
 * @param {Object} [sale] the sale to render; defaults to a fixed sample
 */
const ReceiptPreview = ({ shop, sale = SAMPLE_SALE, className = "" }) => {
  const html = useMemo(
    () => buildReceiptDocument(sale, shop, { printButton: false }),
    [sale, shop]
  );

  // Wider than the paper so the receipt is centred on it, the way a printed
  // slip sits on a desk rather than filling the screen.
  return (
    <div
      className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 p-4 ${className}`}
    >
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3 text-center">
        Receipt preview
      </p>

      <div className="bg-white rounded shadow-sm mx-auto overflow-hidden max-w-full">
        <iframe
          title="Receipt preview"
          srcDoc={html}
          // sandbox with no allow-scripts: nothing in a receipt needs to run,
          // and the document interpolates shop details somebody typed.
          sandbox=""
          className="w-full h-[520px] border-0 block"
        />
      </div>
    </div>
  );
};

export default ReceiptPreview;
