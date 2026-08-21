/**
 * Escapes text destined for the receipt markup below.
 *
 * This file builds HTML by string concatenation and hands it to
 * document.write, so every value that a person typed has to go through here.
 * The customer name is free text, and so is the invoice number — the offline
 * page lets it be edited by hand. A name containing "<" would otherwise open a
 * tag and eat the rest of the receipt.
 */
import { displayLines } from "./buildSaleItems";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Opens a new browser tab and renders a thermal-receipt HTML page.
 *
 * @param {Object} sale
 * @param {string}  sale.invoice_number
 * @param {string}  [sale.customer_name] - printed only if present and non-empty
 * @param {string}  sale.created_at      - ISO timestamp
 * @param {string}  [sale.paid_at]       - ISO timestamp; included only if present and non-null
 * @param {Array}   sale.items
 * @param {string}  [sale.items[].type]          - "service" | "item"
 * @param {string}  [sale.items[].service_name]  - used when type === "service"
 * @param {string}  [sale.items[].item_name]     - used when type === "item"
 * @param {number}  sale.items[].price
 * @param {number}  [sale.items[].qty]
 * @param {Array}   [sale.items[].freebies]
 */
export function printInvoice(sale) {
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

  const newPage = window.open("", "_blank", "width=600,height=800");

  if (!newPage) {
    console.warn(
      "printInvoice: window.open() returned null. The popup may have been blocked by the browser."
    );
    return;
  }

  newPage.document.open();
  newPage.document.write(`
    <html>
      <head>
        <title>Invoice #${escapeHtml(sale.invoice_number)}</title>
        <style>
          body {
            font-family: monospace;
            font-size: 12px;
            width: 58mm;
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
        <!-- Logo -->
        <div style="text-align:center;margin-bottom:4px;">
          <img src="https://i.ibb.co/NFtDrgj/SPINCREDIBLE.png" 
               alt="SPINCREDIBLE Logo" 
               style="max-width:50mm;width:100%;height:auto;margin-bottom:6px;" />
        </div>

        <!-- Store Details -->
        <div style="text-align:center;margin-bottom:8px;">
          <h2 style="font-size:14px;margin:0;">SPINCREDIBLE</h2>
          <p style="margin:0;">Rizal Street Ext</p>
          <p style="margin:0;">Mo: 0962-683-7430</p>
        </div>

        <p>Invoice #: ${escapeHtml(sale.invoice_number)}</p>
        ${
          sale.customer_name
            ? `<p>Customer: ${escapeHtml(sale.customer_name)}</p>`
            : ""
        }
        <p>Date: ${new Date(sale.created_at).toLocaleString()}</p>
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
        <p style="text-align:center;margin-top:12px;">
          Thank you for your purchase!
        </p>

        <!-- Print Button -->
        <button style="
          display:block;
          margin:15px auto;
          padding:8px 16px;
          font-size:14px;
          background-color:#4f46e5;
          color:white;
          border:none;
          border-radius:6px;
          cursor:pointer;
        " onclick="window.print()">Print Invoice</button>
      </body>
    </html>
  `);
  newPage.document.close();
}
