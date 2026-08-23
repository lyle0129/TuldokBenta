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

// ---------------------------------------------------------------------------
// 3. Authentication: the header, the silent refresh, and the three outcomes
//    a refresh can have.
//
//    Requirements 3.1, 3.2, 4.1–4.6. Properties P4, P4b and P5 from the ticket
//    07 design.
// ---------------------------------------------------------------------------
import { beforeEach } from 'vitest'
import { apiRequest, ApiError } from '../api.js'
import { clearSession, getSession, setSession } from '../utils/session.js'
import { clearQueryCache } from '../queryClient.js'

vi.mock('../queryClient.js', async (importOriginal) => ({
  ...(await importOriginal()),
  clearQueryCache: vi.fn(),
}))

const SESSION = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  user: { id: 1, username: 'ada', role: 'manager', must_change_password: false },
  shops: [{ id: 1, name: 'Spincredible', slug: 'spincredible' }],
}

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
})

const authHeaderOf = (call) => call[1]?.headers?.Authorization

/**
 * A fetch mock driven by a queue of responses, keyed by path fragment.
 *
 * Keyed rather than sequential because the interesting cases interleave: a
 * request, a refresh, and the retry of the original all land in one flow, and
 * pinning them by order alone makes the tests fragile to the very thing they
 * are checking.
 */
const mockFetchByPath = (handler) => {
  const fetchMock = vi.fn((url, options) => handler(String(url), options))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('apiRequest — credentials on the wire', () => {
  beforeEach(() => {
    localStorage.clear()
    clearSession()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearSession()
    localStorage.clear()
  })

  it('attaches the bearer token when a session exists', async () => {
    setSession(SESSION)
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(200, [])))

    await apiRequest('/inventory')

    expect(authHeaderOf(fetchMock.mock.calls[0])).toBe('Bearer access-1')
  })

  it('omits the header entirely when there is no session', async () => {
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(200, [])))

    await apiRequest('/inventory')

    expect(authHeaderOf(fetchMock.mock.calls[0])).toBeUndefined()
  })

  it('omits it from the two endpoints that carry a credential in the body', async () => {
    setSession(SESSION)
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(200, {})))

    await apiRequest('/auth/login', { method: 'POST', body: { username: 'ada' } })
    await apiRequest('/auth/refresh', { method: 'POST', body: { refreshToken: 'r' } })

    expect(authHeaderOf(fetchMock.mock.calls[0])).toBeUndefined()
    expect(authHeaderOf(fetchMock.mock.calls[1])).toBeUndefined()
  })

  /**
   * The rest of /auth is NOT exempt, and conflating the two is a real bug this
   * pins: /auth/change-password and /auth/logout mount requireRealAuth on the
   * server, so stripping the header turns both into a flat 401 — the
   * change-password screen answering "Sign in to continue" to a user who plainly
   * is signed in.
   */
  it('still attaches it to the auth endpoints that need a real actor', async () => {
    setSession(SESSION)
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(200, {})))

    await apiRequest('/auth/change-password', {
      method: 'POST',
      body: { currentPassword: 'old', newPassword: 'new' },
    })
    await apiRequest('/auth/logout', { method: 'POST' })

    expect(authHeaderOf(fetchMock.mock.calls[0])).toBe('Bearer access-1')
    expect(authHeaderOf(fetchMock.mock.calls[1])).toBe('Bearer access-1')
  })
})

/**
 * The X-Shop-Id stopgap. Ticket 08 replaces the *choice* of shop with a picker,
 * but the header itself has to exist now: resolveShop's Shop 1 fallback fires
 * only for a request with no Authorization header at all, so an authenticated
 * request that omits X-Shop-Id gets 400 "No shop selected" from every scoped
 * endpoint.
 */
describe('apiRequest — the shop header', () => {
  beforeEach(() => {
    localStorage.clear()
    clearSession()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearSession()
    localStorage.clear()
  })

  const shopHeaderOf = (call) => call[1]?.headers?.['X-Shop-Id']

  it('sends the lowest shop id, not whichever the server listed first', async () => {
    // As the API returns them: ordered by name, so the id-2 shop sorts first.
    setSession({
      ...SESSION,
      shops: [
        { id: 2, name: 'SCRATCH SHOP B', slug: 'scratch-shop-b' },
        { id: 1, name: 'SPINCREDIBLE', slug: 'spincredible' },
      ],
    })
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(200, [])))

    await apiRequest('/inventory')

    expect(shopHeaderOf(fetchMock.mock.calls[0])).toBe('1')
  })

  it('omits it when signed out', async () => {
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(200, [])))

    await apiRequest('/inventory')

    expect(shopHeaderOf(fetchMock.mock.calls[0])).toBeUndefined()
  })

  it('omits it for an account assigned to no shops at all', async () => {
    // A real state: an account can exist for a day before anyone assigns it.
    setSession({ ...SESSION, shops: [] })
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(200, [])))

    await apiRequest('/inventory')

    expect(shopHeaderOf(fetchMock.mock.calls[0])).toBeUndefined()
  })

  it('never sends it to the endpoints that carry a credential in the body', async () => {
    setSession(SESSION)
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(200, {})))

    await apiRequest('/auth/login', { method: 'POST', body: { username: 'ada' } })

    expect(shopHeaderOf(fetchMock.mock.calls[0])).toBeUndefined()
  })

  it('follows the session when a refresh changes the shop list', async () => {
    setSession(SESSION)

    const fetchMock = mockFetchByPath((url, options) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve(
          jsonResponse(200, {
            accessToken: 'access-2',
            user: SESSION.user,
            // Reassigned: shop 1 is gone, shop 5 is new.
            shops: [{ id: 5, name: 'NEW SHOP', slug: 'new-shop' }],
          })
        )
      }
      return Promise.resolve(
        options.headers.Authorization === 'Bearer access-1'
          ? jsonResponse(401, {})
          : jsonResponse(200, [])
      )
    })

    await apiRequest('/inventory')

    expect(shopHeaderOf(fetchMock.mock.calls.at(-1))).toBe('5')
  })
})

describe('apiRequest — silent refresh', () => {
  beforeEach(() => {
    localStorage.clear()
    clearSession()
    vi.clearAllMocks()
    // api.js hard-navigates on a refused refresh; jsdom throws on a real one.
    vi.stubGlobal('location', { ...window.location, assign: vi.fn() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearSession()
    localStorage.clear()
  })

  it('refreshes once, retries once, and returns the result as though nothing happened', async () => {
    setSession(SESSION)
    let inventoryCalls = 0

    const fetchMock = mockFetchByPath((url) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve(
          jsonResponse(200, { accessToken: 'access-2', user: SESSION.user, shops: SESSION.shops })
        )
      }
      inventoryCalls += 1
      return Promise.resolve(
        inventoryCalls === 1
          ? jsonResponse(401, { message: 'Sign in to continue' })
          : jsonResponse(200, [{ id: 7 }])
      )
    })

    await expect(apiRequest('/inventory')).resolves.toEqual([{ id: 7 }])

    expect(inventoryCalls).toBe(2)
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/auth/refresh'))).toHaveLength(1)
    // The retry carries the new token, not the one that just 401'd.
    expect(authHeaderOf(fetchMock.mock.calls.at(-1))).toBe('Bearer access-2')
    expect(getSession().accessToken).toBe('access-2')
    // The refresh token is kept: the endpoint does not rotate it.
    expect(getSession().refreshToken).toBe('refresh-1')
  })

  it('P4: several concurrent 401s share a single refresh', async () => {
    setSession(SESSION)
    let refreshes = 0
    const seen = new Set()

    mockFetchByPath((url, options) => {
      if (url.includes('/auth/refresh')) {
        refreshes += 1
        return Promise.resolve(
          jsonResponse(200, { accessToken: 'access-2', user: SESSION.user, shops: SESSION.shops })
        )
      }
      // 401 on the first attempt for each distinct path, 200 on the retry.
      const first = !seen.has(url) || options.headers.Authorization === 'Bearer access-1'
      seen.add(url)
      return Promise.resolve(first ? jsonResponse(401, {}) : jsonResponse(200, []))
    })

    await Promise.all([
      apiRequest('/inventory'),
      apiRequest('/services'),
      apiRequest('/payment-methods'),
      apiRequest('/open-sales'),
    ])

    expect(refreshes).toBe(1)
  })

  it('P4b: an unreachable server never signs anyone out', async () => {
    setSession(SESSION)

    mockFetchByPath((url) => {
      if (url.includes('/auth/refresh')) return Promise.reject(new TypeError('Failed to fetch'))
      return Promise.resolve(jsonResponse(401, {}))
    })

    await expect(apiRequest('/inventory')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
    })

    // The whole point: the session survives, so the offline till stays usable.
    expect(getSession()).not.toBeNull()
    expect(getSession().accessToken).toBe('access-1')
    expect(clearQueryCache).not.toHaveBeenCalled()
    expect(window.location.assign).not.toHaveBeenCalled()
  })

  it('clears everything and redirects when the server refuses the refresh', async () => {
    setSession(SESSION)

    mockFetchByPath((url) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve(jsonResponse(401, { message: 'Session expired. Sign in again.' }))
      }
      return Promise.resolve(jsonResponse(401, {}))
    })

    await apiRequest('/inventory')

    expect(getSession()).toBeNull()
    expect(clearQueryCache).toHaveBeenCalled()
    expect(window.location.assign).toHaveBeenCalledWith('/login')
  })

  it('does not attempt a refresh when there is no session at all', async () => {
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(401, {})))

    await apiRequest('/inventory')

    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/auth/refresh'))).toBe(false)
  })

  it('P5: a retry never retries — one refresh, one retry, then it fails', async () => {
    setSession(SESSION)
    let refreshes = 0
    let inventoryCalls = 0

    mockFetchByPath((url) => {
      if (url.includes('/auth/refresh')) {
        refreshes += 1
        return Promise.resolve(
          jsonResponse(200, { accessToken: `access-${refreshes + 1}`, user: SESSION.user, shops: SESSION.shops })
        )
      }
      inventoryCalls += 1
      // Still 401 even with the fresh token — a revoked account, say.
      return Promise.resolve(jsonResponse(401, { message: 'Sign in to continue' }))
    })

    await expect(apiRequest('/inventory')).rejects.toMatchObject({ status: 401 })

    expect(refreshes).toBe(1)
    expect(inventoryCalls).toBe(2)
  })

  it('never refreshes on a 401 from the login endpoint', async () => {
    const fetchMock = mockFetchByPath(() =>
      Promise.resolve(jsonResponse(401, { message: 'Incorrect username or password' }))
    )

    await expect(
      apiRequest('/auth/login', { method: 'POST', body: { username: 'ada', password: 'no' } })
    ).rejects.toMatchObject({ status: 401, message: 'Incorrect username or password' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('leaves a 403 alone — the session is valid, the action is not', async () => {
    setSession(SESSION)
    const fetchMock = mockFetchByPath(() =>
      Promise.resolve(jsonResponse(403, { message: 'You do not have access to this action' }))
    )

    await expect(apiRequest('/inventory', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 403,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getSession()).not.toBeNull()
    expect(window.location.assign).not.toHaveBeenCalled()
  })

  it('still lets an AbortError through untranslated', async () => {
    setSession(SESSION)
    const aborted = new DOMException('The user aborted a request.', 'AbortError')
    mockFetchByPath(() => Promise.reject(aborted))

    await expect(apiRequest('/inventory')).rejects.toBe(aborted)
    await expect(apiRequest('/inventory')).rejects.not.toBeInstanceOf(ApiError)
  })
})
