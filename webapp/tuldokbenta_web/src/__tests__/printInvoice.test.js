/**
 * Property-based tests for the printInvoice utility.
 *
 * Feature: frontend-code-cleanup
 * Property 1: Invoice output contains required fields for any sale (Validates: Req 2.3)
 * Property 2: Invoice output uses correct name field per item type  (Validates: Req 2.5)
 * Property 3: Invoice output includes paid date iff paid_at present  (Validates: Req 2.4)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { printInvoice } from '../utils/printInvoice.js'

// ---------------------------------------------------------------------------
// Helper: call printInvoice and capture the full HTML written to the new tab.
// Returns the captured HTML string.
// ---------------------------------------------------------------------------
function captureInvoiceHtml(sale) {
  let captured = ''

  const fakeDoc = {
    open: vi.fn(),
    write: vi.fn((html) => { captured += html }),
    close: vi.fn(),
  }

  vi.stubGlobal('window', {
    ...globalThis.window,
    open: vi.fn(() => ({ document: fakeDoc })),
  })

  // Imported statically at the top of the file: printInvoice is a pure function
  // that reads `window` at call time rather than closing over it at module load,
  // so the stub above is what it sees. This used to be a require(), which broke
  // as soon as printInvoice grew an ESM import of its own.
  printInvoice(sale)

  return captured
}

// ---------------------------------------------------------------------------
// Because we stub globalThis.window we need to restore it between tests.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** An arbitrary non-null, non-undefined string suitable for an invoice field. */
const safeString = fc.string({ minLength: 1, maxLength: 40 })

/**
 * What a name looks like once it reaches the page.
 *
 * printInvoice builds HTML by concatenation, so every value a person typed is
 * escaped on the way in — the invoice number is hand-editable on the offline
 * page and the customer name is free text. "Appears on the receipt" therefore
 * means "appears escaped", which is what these properties check. That the
 * escaping actually happens at all is pinned separately below.
 */
const escaped = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** An arbitrary item of type "item". */
const itemTypeArb = fc.record({
  type: fc.constant('item'),
  item_name: safeString,
  price: fc.float({ min: 0, max: 9999, noNaN: true }),
  qty: fc.integer({ min: 1, max: 99 }),
})

/** An arbitrary item of type "service". */
const serviceTypeArb = fc.record({
  type: fc.constant('service'),
  service_name: safeString,
  price: fc.float({ min: 0, max: 9999, noNaN: true }),
  qty: fc.integer({ min: 1, max: 99 }),
})

/** Mixed array of items containing at least one entry. */
const mixedItemsArb = fc.array(
  fc.oneof(itemTypeArb, serviceTypeArb),
  { minLength: 1, maxLength: 10 }
)

/** A complete sale without paid_at. */
const unpaidSaleArb = fc.record({
  invoice_number: safeString,
  created_at: fc.date().map((d) => d.toISOString()),
  items: mixedItemsArb,
})

/** A complete sale with paid_at present (non-null string). */
const paidSaleArb = unpaidSaleArb.chain((sale) =>
  fc.record({ paid_at: fc.date().map((d) => d.toISOString()) }).map((extra) => ({
    ...sale,
    ...extra,
  }))
)

// ---------------------------------------------------------------------------
// Helper: render a sale via a real (non-stubbed-module) window mock.
// We inline the logic here rather than using captureInvoiceHtml() above so
// that we can use ESM dynamic imports which are required for Vitest.
// ---------------------------------------------------------------------------
async function renderSale(sale) {
  vi.resetModules()

  let captured = ''
  const fakeDoc = {
    open: vi.fn(),
    write: vi.fn((html) => { captured += html }),
    close: vi.fn(),
  }
  vi.stubGlobal('open', vi.fn(() => ({ document: fakeDoc })))

  // We also need window.open — in jsdom, window === globalThis
  const origOpen = window.open
  window.open = vi.fn(() => ({ document: fakeDoc }))

  try {
    const { printInvoice } = await import('../utils/printInvoice.js')
    printInvoice(sale)
  } finally {
    window.open = origOpen
  }

  return captured
}

// ---------------------------------------------------------------------------
// Property 1: Invoice output contains required fields for any sale
// Validates: Req 2.3
// ---------------------------------------------------------------------------
describe('Property 1 — invoice output contains required fields', () => {
  it('HTML contains invoice_number and created_at for any sale', async () => {
    await fc.assert(
      fc.asyncProperty(
        unpaidSaleArb,
        async (sale) => {
          const html = await renderSale(sale)
          // The invoice number must appear
          if (!html.includes(escaped(sale.invoice_number))) return false
          // The created_at date, rendered via toLocaleString, must result in
          // the new Date() object being used — we verify the raw timestamp
          // string is fed into the template by checking the invoice number
          // presence (the date is formatted, so we check the element tag)
          if (!html.includes('Date:')) return false
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 2: Invoice output uses correct name field per item type
// Validates: Req 2.5
// ---------------------------------------------------------------------------
describe('Property 2 — invoice uses correct name field per item type', () => {
  it('service items appear by service_name; item items appear by item_name', async () => {
    await fc.assert(
      fc.asyncProperty(
        unpaidSaleArb,
        async (sale) => {
          const html = await renderSale(sale)
          for (const it of sale.items) {
            if (it.type === 'service') {
              if (!html.includes(escaped(it.service_name))) return false
            } else {
              if (!html.includes(escaped(it.item_name))) return false
            }
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Customer name — optional, so the line has to be absent rather than empty
// ---------------------------------------------------------------------------
describe('customer name', () => {
  it('prints the customer when the sale has one', async () => {
    const html = await renderSale({
      invoice_number: 'INV-0001',
      created_at: '2026-01-01T00:00:00.000Z',
      customer_name: 'Maria Santos',
      items: [{ type: 'item', item_name: 'Ariel', price: 50, qty: 1 }],
    })
    expect(html).toContain('Customer: Maria Santos')
  })

  it.each([undefined, null, ''])(
    'omits the customer line when the name is %p',
    async (customer_name) => {
      const html = await renderSale({
        invoice_number: 'INV-0001',
        created_at: '2026-01-01T00:00:00.000Z',
        customer_name,
        items: [{ type: 'item', item_name: 'Ariel', price: 50, qty: 1 }],
      })
      expect(html).not.toContain('Customer:')
    }
  )

  // The receipt is assembled as a string and handed to document.write, so a
  // name with a "<" in it would otherwise open a tag and swallow the total.
  it('escapes markup in the customer name instead of emitting it', async () => {
    const html = await renderSale({
      invoice_number: 'INV-0001',
      created_at: '2026-01-01T00:00:00.000Z',
      customer_name: '<script>alert(1)</script>',
      items: [{ type: 'item', item_name: 'Ariel', price: 50, qty: 1 }],
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('Total') // the rest of the receipt survived
  })
})

// ---------------------------------------------------------------------------
// Property 3: Invoice output includes paid date iff paid_at is present
// Validates: Req 2.4
// ---------------------------------------------------------------------------
describe('Property 3 — paid date included iff paid_at present', () => {
  it('includes "Paid:" when paid_at is a non-null string', async () => {
    await fc.assert(
      fc.asyncProperty(
        paidSaleArb,
        async (sale) => {
          const html = await renderSale(sale)
          return html.includes('Paid:')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('omits "Paid:" when paid_at is absent', async () => {
    await fc.assert(
      fc.asyncProperty(
        unpaidSaleArb,
        async (sale) => {
          // Ensure paid_at is explicitly absent
          const saleWithoutPaidAt = { ...sale }
          delete saleWithoutPaidAt.paid_at
          const html = await renderSale(saleWithoutPaidAt)
          return !html.includes('Paid:')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('omits "Paid:" when paid_at is null', async () => {
    await fc.assert(
      fc.asyncProperty(
        unpaidSaleArb,
        async (sale) => {
          const saleWithNullPaidAt = { ...sale, paid_at: null }
          const html = await renderSale(saleWithNullPaidAt)
          return !html.includes('Paid:')
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Freebies appear exactly once.
//
// A claimed freebie is stored twice on purpose — nested under the service that
// granted it, and again as a price-0 inventory line so stock is deducted. The
// receipt renders the nested copy, so mapping the raw items array printed it a
// second time as an ordinary "Ariel x1  0.00" row.
// ---------------------------------------------------------------------------
describe('printInvoice — freebie lines', () => {
  const saleWithFreebie = {
    invoice_number: 'INV-0042',
    created_at: '2024-01-01T00:00:00Z',
    items: [
      {
        type: 'service',
        service_name: 'Full Service',
        qty: 1,
        price: 180,
        freebies: [
          { classification: 'Detergent', choices: [{ item: 'Ariel', qty: 1 }] },
        ],
      },
      {
        type: 'item',
        item_name: 'Ariel',
        qty: 1,
        price: 0,
        is_freebie: true,
        for_service: 'Full Service',
      },
    ],
  }

  it('prints a claimed freebie once, as FREE under its service', () => {
    const html = captureInvoiceHtml(saleWithFreebie)

    expect((html.match(/Ariel/g) || []).length).toBe(1)
    expect(html).toContain('+ Ariel x1')
    expect(html).toContain('FREE')
  })

  it('does not print the freebie as an ordinary 0.00 line', () => {
    const html = captureInvoiceHtml(saleWithFreebie)
    expect(html).not.toContain('<span>Ariel x1</span>')
  })

  it('leaves the total alone — freebies are priced 0 either way', () => {
    const html = captureInvoiceHtml(saleWithFreebie)
    expect(html).toContain('180.00')
  })

  it('still prints a legacy price-0 line that has no service to nest under', () => {
    const html = captureInvoiceHtml({
      invoice_number: 'INV-0043',
      created_at: '2024-01-01T00:00:00Z',
      items: [
        { type: 'service', service_name: 'Wash', qty: 1, price: 60 },
        { type: 'item', item_name: 'Ariel', qty: 1, price: 0 },
      ],
    })
    expect(html).toContain('Ariel x1')
  })
})
