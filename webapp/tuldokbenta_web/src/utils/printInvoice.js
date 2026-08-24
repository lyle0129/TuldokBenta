/**
 * Escapes text destined for the receipt markup below.
 *
 * This file builds HTML by string concatenation and hands it to
 * document.write, so every value that a person typed has to go through here.
 * The customer name is free text, and so is the invoice number — the offline
 * page lets it be edited by hand. A name containing "<" would otherwise open a
 * tag and eat the rest of the receipt.
 *
 * Every shop-profile field is free text too, now that the header comes from the
 * database rather than from the literals that used to sit in this file.
 */
import { displayLines } from "./buildSaleItems";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** The width every receipt used to be, and what one prints at when unconfigured. */
const DEFAULT_PAPER_WIDTH_MM = 58;

/**
 * The image a receipt prints, preferring the shop's uploaded logo.
 *
 * The upload wins over `logo_url` because the URL is the older, weaker option: it
 * depends on an external host being reachable at print time and cannot be seen
 * at all by a till with no connection. It stays as the fallback only so that a
 * shop configured before uploads existed keeps printing the logo it already had.
 */
const logoSource = (shop) => shop?.logo_data_url || shop?.logo_url || "";

/**
 * One line of the shop's identity, or nothing at all.
 *
 * Nothing at all is the point. An empty <p> is a blank line you can see on a
 * 58 mm roll, so a shop that has not filled in an address must not pay for the
 * field's existence in paper.
 */
const line = (tag, value, style) =>
  value ? `<${tag} style="${style}">${escapeHtml(value)}</${tag}>` : "";

/**
 * The receipt's identity block: logo, name, address, contact.
 *
 * Exported so the settings pages can render exactly what will print rather than
 * a React lookalike that drifts the first time either one is edited.
 */
export const buildReceiptHeader = (shop) => {
  const logo = logoSource(shop);

  return `
        ${
          logo
            ? `<div style="text-align:center;margin-bottom:4px;">
          <img src="${escapeHtml(logo)}"
               alt="${escapeHtml(shop?.name ?? "Shop logo")}"
               style="max-width:85%;width:auto;height:auto;margin-bottom:6px;" />
        </div>`
            : ""
        }

        <div style="text-align:center;margin-bottom:8px;">
          ${line("h2", shop?.name, "font-size:14px;margin:0;")}
          ${line("p", shop?.address_line, "margin:0;")}
          ${line("p", shop?.contact_number, "margin:0;")}
        </div>`;
};

/**
 * The complete receipt document, as a string.
 *
 * Pure: it opens no window and touches no DOM, which is what lets the preview in
 * the settings pages render the very same bytes the printer receives.
 *
 * @param {Object} sale
 * @param {string}  sale.invoice_number
 * @param {string}  [sale.customer_name] - printed only if present and non-empty
 * @param {string}  [sale.created_at]    - ISO timestamp, on a sale from the server
 * @param {string}  [sale.date]          - ISO timestamp, on a sale queued offline
 * @param {string}  [sale.paid_at]       - ISO timestamp; included only if present and non-null
 * @param {Array}   sale.items
 * @param {string}  [sale.items[].type]          - "service" | "item"
 * @param {string}  [sale.items[].service_name]  - used when type === "service"
 * @param {string}  [sale.items[].item_name]     - used when type === "item"
 * @param {number}  sale.items[].price
 * @param {number}  [sale.items[].qty]
 * @param {Array}   [sale.items[].freebies]
 * @param {Object}  [shop] - the shop's receipt profile. Optional throughout: a till
 *   whose profile has not loaded prints the sale with no header rather than
 *   failing to print, because for a cashier holding a customer's money a receipt
 *   missing its header beats no receipt at all.
 * @param {Object}  [options]
 * @param {boolean} [options.printButton=true] - the on-page Print button, which a
 *   preview does not want
 * @returns {string} the full HTML document
 */
export function buildReceiptDocument(sale, shop, { printButton = true } = {}) {
  const total = sale.items.reduce(
    (sum, it) => sum + Number(it.price) * (it.qty || 1),
    0
  );

  // Generate HTML for items and freebies.
  //
  // displayLines, not sale.items: a claimed freebie is stored twice on purpose
  // — nested under the service that granted it, and again as a price-0
  // inventory line so stock is deducted. Printing the raw array listed it once
  // as "+ Tide 60g x1 FREE" under the service and a second time as an ordinary
  // "Tide 60g x1  0.00" row.
  const itemsHtml = displayLines(sale.items)
    .map((it) => {
      const itemName = it.type === "service" ? it.service_name : it.item_name;
      const qty = it.qty || 1;
      const price = (Number(it.price) * qty).toFixed(2);

      let freebiesHtml = "";
      if (it.freebies && it.freebies.length > 0) {
        freebiesHtml = it.freebies
          .map((f) =>
            f.choices
              .map(
                (c) =>
                  `<div style="display:flex;justify-content:space-between;padding-left:10px;font-size:11px;">
                    <span>+ ${escapeHtml(c.item)} x${escapeHtml(c.qty)}</span>
                    <span>FREE</span>
                  </div>`
              )
              .join("")
          )
          .join("");
      }

      return `
        <div style="margin-bottom:4px;">
          <div style="display:flex;justify-content:space-between;">
            <span>${escapeHtml(itemName)} x${escapeHtml(qty)}</span>
            <span>${price}</span>
          </div>
          ${freebiesHtml}
        </div>
      `;
    })
    .join("");

  // `date` as well as `created_at`: a sale still sitting in the offline queue has no
  // created_at — the server assigns that on sync — so every pre-sync receipt printed
  // "Invalid Date".
  const printedDate = new Date(sale.created_at ?? sale.date).toLocaleString();

  const paperWidth =
    Number(shop?.receipt_paper_width_mm) || DEFAULT_PAPER_WIDTH_MM;

  return `
    <html>
      <head>
        <title>Invoice #${escapeHtml(sale.invoice_number)}</title>
        <style>
          body {
            font-family: monospace;
            font-size: 12px;
            width: ${paperWidth}mm;
            margin: 0;
            padding: 1px;
          }
          hr {
            border: 0;
            border-top: 1px dashed #000;
            margin: 4px 0;
          }
        </style>
      </head>
      <body>
        ${buildReceiptHeader(shop)}

        <p>Invoice #: ${escapeHtml(sale.invoice_number)}</p>
        ${
          sale.customer_name
            ? `<p>Customer: ${escapeHtml(sale.customer_name)}</p>`
            : ""
        }
        <p>Date: ${printedDate}</p>
        ${
          sale.paid_at
            ? `<p>Paid: ${new Date(sale.paid_at).toLocaleString()}</p>`
            : ""
        }
        <hr />

        <!-- Items -->
        ${itemsHtml}
        <hr />

        <!-- Total -->
        <div style="display:flex;justify-content:space-between;font-weight:bold;">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
        <hr />

        <!-- Footer -->
        ${line(
          "p",
          shop?.receipt_footer,
          "text-align:center;margin-top:12px;"
        )}

        ${
          printButton
            ? `<button style="
          display:block;
          margin:15px auto;
          padding:8px 16px;
          font-size:14px;
          background-color:#4f46e5;
          color:white;
          border:none;
          border-radius:6px;
          cursor:pointer;
        " onclick="window.print()">Print Invoice</button>`
            : ""
        }
      </body>
    </html>
  `;
}

/**
 * Opens a new browser tab and renders a thermal-receipt HTML page.
 *
 * @param {Object} sale  see buildReceiptDocument
 * @param {Object} [shop] the shop's receipt profile; optional
 */
export function printInvoice(sale, shop) {
  const newPage = window.open("", "_blank", "width=600,height=800");

  if (!newPage) {
    console.warn(
      "printInvoice: window.open() returned null. The popup may have been blocked by the browser."
    );
    return;
  }

  newPage.document.open();
  newPage.document.write(buildReceiptDocument(sale, shop));
  newPage.document.close();
}
