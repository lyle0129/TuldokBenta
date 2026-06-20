/**
 * Unit tests for API_BASE_URL fallback behaviour and hook URL usage.
 * Requirements: 1.3, 1.4
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

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
// 2. Hook URL tests — each hook must call fetch with a URL starting with
//    API_BASE_URL (here we use the default fallback URL).
// ---------------------------------------------------------------------------
describe('useSales fetch URLs', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('calls fetch with URLs starting with API_BASE_URL', async () => {
    const calls = mockFetch()
    const { useSales } = await import('../hooks/useSales.js')
    const { API_BASE_URL } = await import('../api.js')

    const { result } = renderHook(() => useSales())
    await act(async () => {
      await result.current.loadSales()
    })

    expect(calls.length).toBeGreaterThan(0)
    for (const url of calls) {
      expect(url.startsWith(API_BASE_URL)).toBe(true)
    }
  })
})

describe('useInventory fetch URLs', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('calls fetch with URLs starting with API_BASE_URL', async () => {
    const calls = mockFetch()
    const { useInventory } = await import('../hooks/useInventory.js')
    const { API_BASE_URL } = await import('../api.js')

    const { result } = renderHook(() => useInventory())
    await act(async () => {
      await result.current.loadInventory()
    })

    expect(calls.length).toBeGreaterThan(0)
    for (const url of calls) {
      expect(url.startsWith(API_BASE_URL)).toBe(true)
    }
  })
})

describe('useServices fetch URLs', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('calls fetch with URLs starting with API_BASE_URL', async () => {
    const calls = mockFetch()
    const { useServices } = await import('../hooks/useServices.js')
    const { API_BASE_URL } = await import('../api.js')

    const { result } = renderHook(() => useServices())
    await act(async () => {
      await result.current.loadServices()
    })

    expect(calls.length).toBeGreaterThan(0)
    for (const url of calls) {
      expect(url.startsWith(API_BASE_URL)).toBe(true)
    }
  })
})
