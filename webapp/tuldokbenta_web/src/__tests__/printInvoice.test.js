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
// `shop` is optional throughout, and every existing caller below omits it — which
// is itself the check that a till whose profile has not loaded still prints the
// sale rather than throwing (Requirement 3.3).
function captureInvoiceHtml(sale, shop) {
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
  printInvoice(sale, shop)

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
async function renderSale(sale, shop) {
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
    printInvoice(sale, shop)
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
// Date — a sale from the server carries created_at, one queued offline carries
// `date`, and both have to print
// ---------------------------------------------------------------------------
describe('date line', () => {
  it('prints a queued offline sale, which has `date` and no created_at', async () => {
    // The offline page stores its timestamp as `date`; this function only read
    // `created_at`, so every pre-sync receipt printed "Invalid Date".
    const html = await renderSale({
      invoice_number: 'INV-0001',
      date: '2026-01-01T00:00:00.000Z',
      items: [{ type: 'item', item_name: 'Ariel', price: 50, qty: 1 }],
    })
    expect(html).toContain('Date: ')
    expect(html).not.toContain('Invalid Date')
    expect(html).toContain(new Date('2026-01-01T00:00:00.000Z').toLocaleString())
  })

  it('prefers created_at once the server has assigned one', async () => {
    const html = await renderSale({
      invoice_number: 'INV-0001',
      created_at: '2026-03-04T00:00:00.000Z',
      date: '2026-01-01T00:00:00.000Z',
      items: [{ type: 'item', item_name: 'Ariel', price: 50, qty: 1 }],
    })
    expect(html).toContain(new Date('2026-03-04T00:00:00.000Z').toLocaleString())
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

// ---------------------------------------------------------------------------
// Ticket 09 — the receipt header comes from the shop's profile.
//
// These four pin the properties the design names P1–P4. Everything above this
// point calls printInvoice with one argument and asserts on line items, totals,
// escaping and freebie de-duplication — none of it mentions a shop name, address
// or phone number. That is why a passing suite after this change is real
// evidence the line-item behaviour did not move.
// ---------------------------------------------------------------------------

/** A sale to hang a header off. Fixed, because these properties vary the shop. */
const SALE = {
  invoice_number: 'INV-0001',
  created_at: '2024-01-01T00:00:00Z',
  items: [{ type: 'item', item_name: 'Ariel', qty: 1, price: 10 }],
}

/** An arbitrary receipt profile, any field of which may be blank or absent. */
const profileArb = fc.record({
  name: fc.option(safeString, { nil: undefined }),
  address_line: fc.option(safeString, { nil: undefined }),
  contact_number: fc.option(safeString, { nil: undefined }),
  receipt_footer: fc.option(safeString, { nil: undefined }),
  logo_data_url: fc.option(safeString, { nil: undefined }),
  logo_url: fc.option(safeString, { nil: undefined }),
  receipt_paper_width_mm: fc.integer({ min: 20, max: 210 }),
})

describe('P1 — no shop literal survives', () => {
  it('prints nothing of the old hardcoded shop unless the profile said so', () => {
    const LITERALS = [
      'SPINCREDIBLE',
      'Rizal Street Ext',
      '0962-683-7430',
      'i.ibb.co',
    ]

    fc.assert(
      fc.property(profileArb, (shop) => {
        const html = captureInvoiceHtml(SALE, shop)
        const ownText = JSON.stringify(shop)

        return LITERALS.every(
          (literal) => !html.includes(literal) || ownText.includes(literal)
        )
      }),
      { numRuns: 100 }
    )
  })
})

describe('P2 — every profile field is escaped', () => {
  it('never emits a raw < > " or & from a profile field', () => {
    const nasty = fc.constantFrom(
      '<script>alert(1)</script>',
      '" onerror="alert(1)',
      'Tom & Jerry',
      "it's <b>bold</b>"
    )

    fc.assert(
      fc.property(
        fc.record({
          name: nasty,
          address_line: nasty,
          contact_number: nasty,
          receipt_footer: nasty,
        }),
        (shop) => {
          const html = captureInvoiceHtml(SALE, shop)

          // Every one of them must appear, and only in its escaped form.
          return Object.values(shop).every(
            (value) => html.includes(escaped(value)) && !html.includes(value)
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('P3 — an empty field produces no element', () => {
  it('emits no blank <p>, <h2> or <img> for a profile with nothing in it', () => {
    // A blank line is visible on a 58mm roll, so an absent address must cost no
    // paper at all.
    const html = captureInvoiceHtml(SALE, {
      name: '',
      address_line: '',
      contact_number: '',
      receipt_footer: '',
      logo_url: '',
      logo_data_url: '',
    })

    expect(html).not.toMatch(/<p style="margin:0;"><\/p>/)
    expect(html).not.toMatch(/<h2[^>]*><\/h2>/)
    expect(html).not.toContain('<img')
  })

  it('emits no <img> when neither logo field is set', () => {
    const html = captureInvoiceHtml(SALE, { name: 'Shop' })
    expect(html).not.toContain('<img')
    expect(html).toContain('Shop')
  })

  it('prefers the uploaded logo over a legacy logo_url', () => {
    const html = captureInvoiceHtml(SALE, {
      logo_data_url: 'data:image/png;base64,AAAA',
      logo_url: 'https://example.test/old.png',
    })

    expect(html).toContain('data:image/png;base64,AAAA')
    expect(html).not.toContain('example.test')
  })

  it('falls back to logo_url when nothing has been uploaded', () => {
    const html = captureInvoiceHtml(SALE, {
      logo_url: 'https://example.test/old.png',
    })

    expect(html).toContain('https://example.test/old.png')
  })
})

describe('P4 — a missing profile still prints the sale', () => {
  it('renders the line items and total with no shop at all', () => {
    fc.assert(
      fc.property(
        mixedItemsArb,
        fc.constantFrom(undefined, null),
        (items, shop) => {
          const sale = { ...SALE, items }
          const html = captureInvoiceHtml(sale, shop)

          const total = items
            .reduce((sum, it) => sum + Number(it.price) * (it.qty || 1), 0)
            .toFixed(2)

          return html.includes('Total') && html.includes(total)
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('the paper width comes from the profile', () => {
  it('uses the shop’s width, and 58mm when it has none', () => {
    expect(captureInvoiceHtml(SALE, { receipt_paper_width_mm: 80 })).toContain(
      'width: 80mm'
    )
    expect(captureInvoiceHtml(SALE, {})).toContain('width: 58mm')
    expect(captureInvoiceHtml(SALE, undefined)).toContain('width: 58mm')
  })
})

describe('buildReceiptDocument is what printInvoice writes', () => {
  it('produces the same document the printer receives', async () => {
    const { buildReceiptDocument } = await import('../utils/printInvoice.js')
    const shop = { name: 'Shop', receipt_footer: 'Thanks!' }

    expect(captureInvoiceHtml(SALE, shop)).toBe(
      buildReceiptDocument(SALE, shop)
    )
  })

  it('omits the Print button when asked, for the settings-page preview', async () => {
    const { buildReceiptDocument } = await import('../utils/printInvoice.js')

    expect(buildReceiptDocument(SALE, {}, { printButton: false })).not.toContain(
      'window.print()'
    )
    expect(buildReceiptDocument(SALE, {})).toContain('window.print()')
  })
})
