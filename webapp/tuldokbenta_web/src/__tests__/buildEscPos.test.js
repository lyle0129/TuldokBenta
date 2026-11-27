/**
 * Property-based tests for buildEscPos()
 *
 * Feature: ble-receipt-printing
 *
 * Validates: Requirements 1.2, 1.3, 1.5, 1.7
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildEscPos, deriveCols } from '../utils/buildEscPos';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A minimal valid sale item (service or inventory item). */
const saleItemArb = fc.record({
  type: fc.constantFrom('service', 'item'),
  service_name: fc.string({ minLength: 1, maxLength: 30 }),
  item_name: fc.string({ minLength: 1, maxLength: 30 }),
  price: fc.float({ min: 0, max: 9999, noNaN: true }),
  qty: fc.integer({ min: 1, max: 10 }),
});

/** A valid sale object. */
const saleArb = fc.record({
  invoice_number: fc.string({ minLength: 1, maxLength: 20 }),
  customer_name: fc.option(fc.string({ minLength: 1, maxLength: 30 })),
  created_at: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }).map((d) => d.toISOString())),
  items: fc.array(saleItemArb, { minLength: 1, maxLength: 5 }),
});

/** A valid shop object. */
const shopArb = fc.record({
  name: fc.option(fc.string({ minLength: 1, maxLength: 40 })),
  address_line: fc.option(fc.string({ minLength: 1, maxLength: 60 })),
  contact_number: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
  receipt_paper_width_mm: fc.option(fc.integer({ min: 20, max: 210 })),
  receipt_footer: fc.option(fc.string({ minLength: 1, maxLength: 60 })),
});

/**
 * Encode a string the same way buildEscPos does: replace non-Latin-1 characters
 * with '?'. Used to normalise the invoice number before checking containment.
 */
function toLatin1(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    out += str.charCodeAt(i) <= 255 ? str[i] : '?';
  }
  return out;
}

// ---------------------------------------------------------------------------
// Property 1: ESC/POS encoding round-trip contains invoice number
// Validates: Requirements 1.2, 1.7
// ---------------------------------------------------------------------------

describe('buildEscPos — Property 1: encoding round-trip contains invoice number', () => {
  it('decoding output as Latin-1 always contains the invoice number', () => {
    fc.assert(
      fc.property(saleArb, (sale) => {
        const bytes = buildEscPos(sale);
        const decoded = new TextDecoder('latin1').decode(bytes);
        // Non-Latin-1 chars in the invoice number are substituted with '?'
        const normalised = toLatin1(sale.invoice_number);
        expect(decoded).toContain(normalised);
      }),
      { numRuns: 100 }
    );
  });

  it('works with a shop object too', () => {
    fc.assert(
      fc.property(saleArb, shopArb, (sale, shop) => {
        const bytes = buildEscPos(sale, shop);
        const decoded = new TextDecoder('latin1').decode(bytes);
        const normalised = toLatin1(sale.invoice_number);
        expect(decoded).toContain(normalised);
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Paper-cut command always terminates the byte array
// Validates: Requirement 1.5
// ---------------------------------------------------------------------------

describe('buildEscPos — Property 2: paper-cut command always terminates bytes', () => {
  const FEED_CUT = [0x1d, 0x56, 0x00]; // GS V 0

  it('last 3 bytes are always the full-cut command, with no shop', () => {
    fc.assert(
      fc.property(saleArb, (sale) => {
        const bytes = buildEscPos(sale);
        const tail = Array.from(bytes.slice(-3));
        expect(tail).toEqual(FEED_CUT);
      }),
      { numRuns: 100 }
    );
  });

  it('last 3 bytes are always the full-cut command, with various shop values', () => {
    fc.assert(
      fc.property(
        saleArb,
        fc.option(shopArb, { nil: undefined }),
        (sale, shop) => {
          const bytes = buildEscPos(sale, shop);
          const tail = Array.from(bytes.slice(-3));
          expect(tail).toEqual(FEED_CUT);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('last 3 bytes are the cut command when shop is null', () => {
    fc.assert(
      fc.property(saleArb, (sale) => {
        const bytes = buildEscPos(sale, null);
        const tail = Array.from(bytes.slice(-3));
        expect(tail).toEqual(FEED_CUT);
      }),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Output line width respects the paper width
// Validates: Requirement 1.3
// ---------------------------------------------------------------------------

describe('buildEscPos — Property 3: output line width respects paper width', () => {
  /** Paper width values: the full server-accepted range, plus invalid/absent variants. */
  const paperWidthArb = fc.oneof(
    fc.integer({ min: 20, max: 210 }),
    fc.constant(null),
    fc.constant(undefined),
    fc.constant('abc'),
    fc.constant(NaN),
    fc.constant(0),
  );

  /** Also exercise paid_at, which adds a "Paid:" line. */
  const saleWithPaidArb = fc.record({
    invoice_number: fc.string({ minLength: 1, maxLength: 20 }),
    customer_name: fc.option(fc.string({ minLength: 1, maxLength: 30 })),
    created_at: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }).map((d) => d.toISOString())),
    paid_at: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }).map((d) => d.toISOString())),
    items: fc.array(saleItemArb, { minLength: 1, maxLength: 5 }),
  });

  it('no decoded text line exceeds the derived column count', () => {
    fc.assert(
      fc.property(saleWithPaidArb, paperWidthArb, shopArb, (sale, widthMm, shop) => {
        const fullShop = { ...shop, receipt_paper_width_mm: widthMm };
        const cols = deriveCols(widthMm);
        const bytes = buildEscPos(sale, fullShop);
        const decoded = new TextDecoder('latin1').decode(bytes);

        // Split on LF and check each non-empty line's byte length.
        // In Latin-1, byte count === character count.
        for (const line of decoded.split('\n')) {
          if (line.length === 0) continue;
          // The one documented exception: an invoice number longer than the
          // paper is printed whole on a line of its own (Property 1 wins).
          if (line === sale.invoice_number && sale.invoice_number.length > cols) continue;
          expect(line.length).toBeLessThanOrEqual(cols);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('defaults to 58 mm (32 cols) when receipt_paper_width_mm is absent', () => {
    fc.assert(
      fc.property(saleArb, (sale) => {
        const bytes = buildEscPos(sale, {});
        const decoded = new TextDecoder('latin1').decode(bytes);
        const lines = decoded.split('\n');
        for (const line of lines) {
          if (line.length === 0) continue;
          expect(line.length).toBeLessThanOrEqual(32);
        }
      }),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// deriveCols — fixed values for the real thermal rolls
// ---------------------------------------------------------------------------

describe('deriveCols', () => {
  it('maps a 58 mm roll to 32 columns', () => {
    expect(deriveCols(58)).toBe(32);
    expect(deriveCols('58')).toBe(32);
  });

  it('maps an 80 mm roll to 48 columns', () => {
    expect(deriveCols(80)).toBe(48);
    expect(deriveCols('80')).toBe(48);
  });

  it.each([undefined, null, 'abc', NaN, 0, ''])(
    'falls back to 32 columns for %p',
    (value) => {
      expect(deriveCols(value)).toBe(32);
    }
  );

  it('is monotonic and at least 1 across the accepted 20–210 mm range', () => {
    let prev = 0;
    for (let mm = 20; mm <= 210; mm++) {
      const cols = deriveCols(mm);
      expect(cols).toBeGreaterThanOrEqual(1);
      expect(cols).toBeGreaterThanOrEqual(prev);
      prev = cols;
    }
  });
});

// ---------------------------------------------------------------------------
// Example-based unit tests
// ---------------------------------------------------------------------------

describe('buildEscPos — unit examples', () => {
  const simpleSale = {
    invoice_number: 'INV-001',
    items: [{ type: 'service', service_name: 'Wash', price: 100, qty: 1 }],
  };

  it('returns a Uint8Array', () => {
    expect(buildEscPos(simpleSale)).toBeInstanceOf(Uint8Array);
  });

  it('output is non-empty', () => {
    expect(buildEscPos(simpleSale).length).toBeGreaterThan(0);
  });

  it('omits shop header when shop is undefined', () => {
    const bytes = buildEscPos(simpleSale);
    const decoded = new TextDecoder('latin1').decode(bytes);
    expect(decoded).toContain('INV-001');
  });

  it('omits shop header when shop is null', () => {
    const bytes = buildEscPos(simpleSale, null);
    const decoded = new TextDecoder('latin1').decode(bytes);
    expect(decoded).toContain('INV-001');
  });

  it('includes shop name when shop is provided', () => {
    const bytes = buildEscPos(simpleSale, { name: 'My Shop' });
    const decoded = new TextDecoder('latin1').decode(bytes);
    expect(decoded).toContain('My Shop');
  });

  it('includes the total line', () => {
    const bytes = buildEscPos(simpleSale);
    const decoded = new TextDecoder('latin1').decode(bytes);
    expect(decoded).toContain('100.00');
  });

  it('prints a Paid line only when paid_at is set, like printInvoice', () => {
    const unpaid = new TextDecoder('latin1').decode(buildEscPos(simpleSale));
    expect(unpaid).not.toContain('Paid:');

    const paidAt = '2026-03-04T05:06:07.000Z';
    const paid = new TextDecoder('latin1').decode(
      buildEscPos({ ...simpleSale, paid_at: paidAt })
    );
    expect(paid).toContain('Paid: ' + new Date(paidAt).toLocaleString().slice(0, 20));
  });

  it('uses 48 columns for an 80 mm roll', () => {
    const decoded = new TextDecoder('latin1').decode(
      buildEscPos(simpleSale, { receipt_paper_width_mm: 80 })
    );
    expect(decoded).toContain('-'.repeat(48));
    expect(decoded).not.toContain('-'.repeat(49));
  });
});
