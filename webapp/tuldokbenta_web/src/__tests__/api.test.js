/**
 * Unit tests for API_BASE_URL fallback behaviour and hook URL usage.
 * Requirements: 1.3, 1.4
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderHookWithQuery } from './utils/renderWithQuery.jsx'

// ---------------------------------------------------------------------------
// Helper: resolve API_BASE_URL from a freshly-loaded module with controlled env
// ---------------------------------------------------------------------------
async function loadApiModule(viteApiUrl) {
  vi.resetModules()
  if (viteApiUrl !== undefined) {
    vi.stubEnv('VITE_API_URL', viteApiUrl)
  } else {
    // Make sure the key is absent so the ?? fallback fires
    vi.unstubAllEnvs()
  }
  const mod = await import('../api.js')
  return mod
}

// ---------------------------------------------------------------------------
// 1. API_BASE_URL value tests
// ---------------------------------------------------------------------------
describe('API_BASE_URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('equals the VITE_API_URL value when the env var is set', async () => {
    const { API_BASE_URL } = await loadApiModule('https://api.example.com/api')
    expect(API_BASE_URL).toBe('https://api.example.com/api')
  })

  it('falls back to http://localhost:5001/api when VITE_API_URL is not set', async () => {
    const { API_BASE_URL } = await loadApiModule(undefined)
    expect(API_BASE_URL).toBe('http://localhost:5001/api')
  })
})

// ---------------------------------------------------------------------------
// Helper: build a minimal fetch mock that returns an empty array
// ---------------------------------------------------------------------------
function mockFetch() {
  const calls = []
  const fetchMock = vi.fn((url) => {
    calls.push(url)
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

// ---------------------------------------------------------------------------
// 2. Hook URL tests — each read hook must call fetch with a URL starting with
//    API_BASE_URL. These hooks now fetch on mount rather than exposing a
//    loadX(), so the trigger is the render itself.
//
//    Note: no vi.resetModules() here, unlike the block above. Resetting the
//    registry mid-test would hand the dynamically imported hooks a different
//    copy of @tanstack/react-query than the statically imported wrapper holds,
//    and the provider's context would no longer reach them.
// ---------------------------------------------------------------------------
const expectAllUrlsUnderBaseUrl = async (hookName, importHook) => {
  const calls = mockFetch()
  const useHook = await importHook()
  const { API_BASE_URL } = await import('../api.js')

  renderHookWithQuery(() => useHook())

  await waitFor(() => expect(calls.length).toBeGreaterThan(0))
  for (const url of calls) {
    expect(url.startsWith(API_BASE_URL), `${hookName} requested ${url}`).toBe(true)
  }
}

describe('read hook fetch URLs', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('useOpenSales calls fetch with URLs starting with API_BASE_URL', async () => {
    await expectAllUrlsUnderBaseUrl(
      'useOpenSales',
      async () => (await import('../hooks/useSales.js')).useOpenSales
    )
  })

  it('useClosedSales calls fetch with URLs starting with API_BASE_URL', async () => {
    await expectAllUrlsUnderBaseUrl(
      'useClosedSales',
      async () => (await import('../hooks/useSales.js')).useClosedSales
    )
  })

  it('useClosedSalesForDay calls fetch with URLs starting with API_BASE_URL', async () => {
    const { useClosedSalesForDay } = await import('../hooks/useSales.js')
    const calls = mockFetch()
    const { API_BASE_URL } = await import('../api.js')

    renderHookWithQuery(() => useClosedSalesForDay('2026-08-17'))

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    for (const url of calls) {
      expect(url.startsWith(API_BASE_URL)).toBe(true)
    }
  })

  it('useInventory calls fetch with URLs starting with API_BASE_URL', async () => {
    await expectAllUrlsUnderBaseUrl(
      'useInventory',
      async () => (await import('../hooks/useInventory.js')).useInventory
    )
  })

  it('useServices calls fetch with URLs starting with API_BASE_URL', async () => {
    await expectAllUrlsUnderBaseUrl(
      'useServices',
      async () => (await import('../hooks/useServices.js')).useServices
    )
  })
})
