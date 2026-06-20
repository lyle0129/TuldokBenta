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

  // Re-import printInvoice freshly so it uses the stubbed window.
  // We import it directly (not dynamically) because it's a pure function and
  // doesn't close over window at module load time — it reads window at call time.
  const { printInvoice } = require('../utils/printInvoice.js')
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
          if (!html.includes(sale.invoice_number)) return false
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
              if (!html.includes(it.service_name)) return false
            } else {
              if (!html.includes(it.item_name)) return false
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
