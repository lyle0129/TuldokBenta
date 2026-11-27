/**
 * buildEscPos.js — Pure ESC/POS receipt byte builder
 *
 * Converts a sale object and optional shop object into a Uint8Array of
 * ESC/POS printer commands. No DOM access, no side effects.
 *
 * Text encoding is Latin-1 (ISO-8859-1): one byte per character, with `?`
 * substituted for any character outside the Latin-1 range (code point > 255).
 * TextEncoder is intentionally NOT used — it defaults to UTF-8, and thermal
 * printers expect single-byte encodings.
 */

import { displayLines } from './buildSaleItems';
import {
  INIT,
  ALIGN_CENTER,
  ALIGN_LEFT,
  BOLD_ON,
  BOLD_OFF,
  LF,
  FEED_CUT,
  COLS_58MM,
  COLS_80MM,
} from './escposCommands';

// ---------------------------------------------------------------------------
// Latin-1 encoding helpers
// ---------------------------------------------------------------------------

/**
 * Encode a string as Latin-1 bytes.
 * Characters with code points > 255 are replaced with `?` (0x3F).
 *
 * @param {string} str
 * @returns {number[]}
 */
function latin1Bytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const cp = str.charCodeAt(i);
    bytes.push(cp <= 255 ? cp : 0x3f /* '?' */);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Column-width helpers
// ---------------------------------------------------------------------------

/**
 * Derive the printer column count (Font A, 12-dot characters) from the paper
 * width in mm. Defaults to 58 mm when `widthMm` is absent, zero, or
 * non-numeric.
 *
 * Anchored on the two thermal rolls in the wild, so both hit their exact
 * hardware column counts:
 *   - 58 mm roll → 384 printable dots → 32 columns
 *   - 80 mm roll → 576 printable dots → 48 columns
 * Widths up to 58 mm scale from the 58 mm ratio; wider ones from the 80 mm
 * ratio. The result is monotonic in `widthMm` and never below 1.
 *
 * (The 0.423 mm figure that once appeared here is the *dot* pitch of a
 * 203 dpi head, not a character width — dividing by it gave 137 columns.)
 *
 * @param {number|string|null|undefined} widthMm
 * @returns {number}
 */
export function deriveCols(widthMm) {
  const mm = Number(widthMm) || 58;
  const cols = mm <= 58 ? (mm * COLS_58MM) / 58 : (mm * COLS_80MM) / 80;
  return Math.max(1, Math.floor(cols));
}

/**
 * Truncate a string to at most `cols` characters (Latin-1 bytes).
 * Since each character is one byte in Latin-1, character count === byte count.
 *
 * @param {string} str
 * @param {number} cols
 * @returns {string}
 */
function truncate(str, cols) {
  if (str.length <= cols) return str;
  return str.slice(0, cols);
}

/**
 * Word-wrap a string into lines of at most `cols` characters each.
 * Splits on whitespace boundaries where possible; if a single word is longer
 * than `cols`, it is hard-truncated.
 *
 * @param {string} str
 * @param {number} cols
 * @returns {string[]}
 */
function wordWrap(str, cols) {
  if (!str) return [];

  const result = [];
  const words = str.split(/\s+/).filter(Boolean);
  let current = '';

  for (const word of words) {
    const w = word.length > cols ? word.slice(0, cols) : word;

    if (current === '') {
      current = w;
    } else if (current.length + 1 + w.length <= cols) {
      current += ' ' + w;
    } else {
      result.push(current);
      current = w;
    }
  }

  if (current) result.push(current);
  return result;
}

/**
 * Center-align text within `cols` characters.
 * Pads with spaces on the left so the text is centered. Does not pad the right
 * (thermal printers auto-wrap, and trailing spaces waste nothing of interest).
 *
 * @param {string} str
 * @param {number} cols
 * @returns {string}
 */
function center(str, cols) {
  const s = truncate(str, cols);
  const padding = Math.max(0, Math.floor((cols - s.length) / 2));
  return ' '.repeat(padding) + s;
}

/**
 * Right-align `right` and left-align `left` within a field of `cols` chars.
 * If both strings together (with at least one space) exceed `cols`, the left
 * portion is truncated to make room.
 *
 * @param {string} left
 * @param {string} right
 * @param {number} cols
 * @returns {string}
 */
function leftRight(left, right, cols) {
  const r = truncate(right, cols);
  const available = cols - r.length - 1; // at least 1 space separator
  if (available <= 0) {
    // No room for left at all; just show right, right-aligned
    return r.padStart(cols);
  }
  const l = truncate(left, available);
  const spaces = cols - l.length - r.length;
  return l + ' '.repeat(Math.max(1, spaces)) + r;
}

// ---------------------------------------------------------------------------
// Byte-sequence builder
// ---------------------------------------------------------------------------

/**
 * Append a command constant (array of numbers) followed by a line-feed.
 * Commands are placed on their own LF-terminated segment so that text
 * segments never carry command-byte overhead. The segment containing only
 * command bytes is at most a few bytes — well under any practical column
 * count — so it satisfies the line-width property.
 *
 * @param {number[]} buf
 * @param {number[]} cmd
 */
function pushCmd(buf, cmd) {
  for (const b of cmd) buf.push(b);
  buf.push(LF);
}

/**
 * Append a command constant without a trailing line-feed.
 * Used for terminal commands like FEED_CUT that must remain as the last
 * bytes in the buffer (Property 2 asserts last 3 bytes are the cut command).
 *
 * @param {number[]} buf
 * @param {number[]} cmd
 */
function pushCmdRaw(buf, cmd) {
  for (const b of cmd) buf.push(b);
}

/**
 * Append a text string as Latin-1 bytes followed by a line-feed.
 *
 * @param {number[]} buf
 * @param {string} text
 */
function pushLine(buf, text) {
  for (const b of latin1Bytes(text)) buf.push(b);
  buf.push(LF);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a complete ESC/POS receipt byte sequence.
 *
 * @param {Object} sale
 * @param {string}  sale.invoice_number
 * @param {string}  [sale.customer_name]
 * @param {string}  [sale.created_at]   — ISO timestamp (server-assigned)
 * @param {string}  [sale.date]         — ISO timestamp (offline-queued)
 * @param {string}  [sale.paid_at]
 * @param {Array}   sale.items
 *
 * @param {Object}  [shop]
 * @param {string}  [shop.name]
 * @param {string}  [shop.address_line]
 * @param {string}  [shop.contact_number]
 * @param {number|string} [shop.receipt_paper_width_mm]
 * @param {string}  [shop.receipt_footer]
 *
 * @returns {Uint8Array}
 */
export function buildEscPos(sale, shop) {
  const cols = deriveCols(shop?.receipt_paper_width_mm);
  const buf = [];

  // ── Initialize printer ─────────────────────────────────────────────────
  pushCmd(buf, INIT);

  // ── Optional shop header ───────────────────────────────────────────────
  if (shop != null) {
    pushCmd(buf, ALIGN_CENTER);

    if (shop.name) {
      for (const line of wordWrap(shop.name, cols)) {
        pushLine(buf, center(line, cols));
      }
    }
    if (shop.address_line) {
      for (const line of wordWrap(shop.address_line, cols)) {
        pushLine(buf, center(line, cols));
      }
    }
    if (shop.contact_number) {
      for (const line of wordWrap(shop.contact_number, cols)) {
        pushLine(buf, center(line, cols));
      }
    }

    pushCmd(buf, ALIGN_LEFT);
  }

  // ── Invoice number (bold) ──────────────────────────────────────────────
  // When "Invoice #: <number>" does not fit, the number is emitted again on a
  // line of its own so it is never truncated away (Property 1: round-trip
  // identity).
  //
  // That raw line is the ONE deliberate exception to the column limit: an
  // invoice number longer than the paper is wide is printed whole and left to
  // the printer's own wrapping, because a receipt that loses part of its
  // invoice number is worse than one that wraps. Real numbers (e.g. INV-0001)
  // are far shorter than the narrowest supported paper.
  const invoiceNumber = String(sale.invoice_number ?? '');
  pushCmd(buf, BOLD_ON);
  pushLine(buf, truncate('Invoice #: ' + invoiceNumber, cols));
  if (invoiceNumber && ('Invoice #: ' + invoiceNumber).length > cols) {
    pushLine(buf, invoiceNumber);
  }
  pushCmd(buf, BOLD_OFF);

  // ── Optional customer name ─────────────────────────────────────────────
  if (sale.customer_name) {
    pushLine(buf, truncate('Customer: ' + sale.customer_name, cols));
  }

  // ── Date ───────────────────────────────────────────────────────────────
  const printedDate = new Date(sale.created_at ?? sale.date).toLocaleString();
  pushLine(buf, truncate('Date: ' + printedDate, cols));

  // ── Paid date (closed sales only) ──────────────────────────────────────
  // Mirrors printInvoice, so a BLE receipt carries the same lines as the popup.
  if (sale.paid_at) {
    const paidDate = new Date(sale.paid_at).toLocaleString();
    pushLine(buf, truncate('Paid: ' + paidDate, cols));
  }

  // ── Separator ──────────────────────────────────────────────────────────
  pushLine(buf, '-'.repeat(cols));

  // ── Line items ─────────────────────────────────────────────────────────
  const lines = displayLines(sale.items ?? []);
  for (const it of lines) {
    const itemName = it.type === 'service' ? (it.service_name ?? '') : (it.item_name ?? '');
    const qty = it.qty || 1;
    const lineTotal = (Number(it.price) * qty).toFixed(2);
    const qtyLabel = ' x' + qty;
    const left = truncate(itemName, cols - qtyLabel.length) + qtyLabel;
    pushLine(buf, leftRight(left, lineTotal, cols));

    // Freebies nested under this line
    if (Array.isArray(it.freebies)) {
      for (const f of it.freebies) {
        if (!Array.isArray(f.choices)) continue;
        for (const c of f.choices) {
          if (!c.item) continue;
          const freebieLabel = truncate('  + ' + c.item + ' x' + (c.qty ?? 1), cols - 4);
          pushLine(buf, leftRight(freebieLabel, 'FREE', cols));
        }
      }
    }
  }

  // ── Separator ──────────────────────────────────────────────────────────
  pushLine(buf, '-'.repeat(cols));

  // ── Total (bold) ───────────────────────────────────────────────────────
  const total = (sale.items ?? []).reduce(
    (sum, it) => sum + Number(it.price) * (it.qty || 1),
    0
  );

  pushCmd(buf, BOLD_ON);
  pushLine(buf, leftRight('Total', total.toFixed(2), cols));
  pushCmd(buf, BOLD_OFF);

  // ── Separator ──────────────────────────────────────────────────────────
  pushLine(buf, '-'.repeat(cols));

  // ── Optional footer ────────────────────────────────────────────────────
  if (shop?.receipt_footer) {
    pushCmd(buf, ALIGN_CENTER);
    for (const line of wordWrap(shop.receipt_footer, cols)) {
      pushLine(buf, center(line, cols));
    }
    pushCmd(buf, ALIGN_LEFT);
  }

  // ── Feed and cut ───────────────────────────────────────────────────────
  pushCmdRaw(buf, FEED_CUT);

  return new Uint8Array(buf);
}

// ---------------------------------------------------------------------------
// Chunk helper
// ---------------------------------------------------------------------------

/**
 * Split a Uint8Array into sequential slices of at most `chunkSize` bytes.
 *
 * Properties guaranteed:
 *   - Every slice has length ≤ chunkSize.
 *   - The slices are non-overlapping and cover the entire input (lossless partition).
 *   - Concatenating all slices in order reproduces the original array exactly.
 *   - An empty input produces an empty array of slices (not a single empty slice).
 *
 * @param {Uint8Array} bytes      - The byte array to split.
 * @param {number}     chunkSize  - Maximum bytes per slice; must be a positive integer.
 * @returns {Uint8Array[]}        - Ordered array of Uint8Array slices.
 */
export function chunkBytes(bytes, chunkSize) {
  if (chunkSize <= 0 || !Number.isFinite(chunkSize)) {
    throw new RangeError('chunkSize must be a positive finite number');
  }

  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(bytes.subarray(offset, offset + chunkSize));
  }
  return chunks;
}
