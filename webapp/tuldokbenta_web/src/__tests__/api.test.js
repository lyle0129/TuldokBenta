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
import {
  clearSession,
  getActiveShopId,
  getSession,
  setActiveShopId,
  setSession,
} from '../utils/session.js'
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
 * The X-Shop-Id header, now driven by the picker's selection rather than by
 * ticket 07's lowest-id stopgap.
 *
 * The header is not optional: resolveShop's Shop 1 fallback fires only for a
 * request with no Authorization header at all, so an authenticated request that
 * omits X-Shop-Id gets 400 "No shop selected" from every scoped endpoint.
 */
describe('apiRequest — the shop header', () => {
  beforeEach(() => {
    localStorage.clear()
    clearSession()
    vi.clearAllMocks()
    vi.stubGlobal('location', { ...window.location, assign: vi.fn() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearSession()
    localStorage.clear()
  })

  const shopHeaderOf = (call) => call[1]?.headers?.['X-Shop-Id']

  it('sends the shop the picker selected', async () => {
    setSession(SESSION)
    setActiveShopId(4)
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(200, [])))

    await apiRequest('/inventory')

    expect(shopHeaderOf(fetchMock.mock.calls[0])).toBe('4')
  })

  it('omits it when no shop is selected', async () => {
    // Signed in but still on the picker. Ticket 07 would have guessed a shop
    // from the session here; guessing is what this ticket removes.
    setSession(SESSION)
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(200, [])))

    await apiRequest('/inventory')

    expect(shopHeaderOf(fetchMock.mock.calls[0])).toBeUndefined()
  })

  it('omits it when signed out', async () => {
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(200, [])))

    await apiRequest('/inventory')

    expect(shopHeaderOf(fetchMock.mock.calls[0])).toBeUndefined()
  })

  it('never sends it to the endpoints that carry a credential in the body', async () => {
    setSession(SESSION)
    setActiveShopId(1)
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(200, {})))

    await apiRequest('/auth/login', { method: 'POST', body: { username: 'ada' } })

    expect(shopHeaderOf(fetchMock.mock.calls[0])).toBeUndefined()
  })

  it('never sends it to /auth/me, which asks who you are and not about a shop', async () => {
    setSession(SESSION)
    setActiveShopId(1)
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(200, {})))

    await apiRequest('/auth/me')

    expect(shopHeaderOf(fetchMock.mock.calls[0])).toBeUndefined()
  })

  /**
   * The super-admin surface mounts no resolveShop at all — it takes the shop as
   * an explicit path or body parameter instead (backend/routes/admin.js). The
   * header would be ignored there, and sending it would read as though the route
   * were scoped by it.
   */
  it('never sends it to the admin routes', async () => {
    setSession(SESSION)
    setActiveShopId(1)
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(200, [])))

    await apiRequest('/admin/shops')

    expect(shopHeaderOf(fetchMock.mock.calls[0])).toBeUndefined()
  })

  it('keeps the selection across a refresh that rewrites the session', async () => {
    // The selection is stored beside the session rather than inside it, so a
    // refresh — which replaces `user` and `shops` wholesale from the server's
    // response — cannot drop the shop the user is working in.
    setSession(SESSION)
    setActiveShopId(1)

    const fetchMock = mockFetchByPath((url, options) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve(
          jsonResponse(200, {
            accessToken: 'access-2',
            user: SESSION.user,
            shops: SESSION.shops,
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

    expect(shopHeaderOf(fetchMock.mock.calls.at(-1))).toBe('1')
  })

  /**
   * The offline sync's override, and nothing else's.
   *
   * A queued sale carries the shop it was taken at. A cashier can queue at one
   * branch, switch, and sync from the other — so the sync has to name a shop
   * rather than inherit whichever is selected when the connection returns.
   */
  it('sends an explicit shop in place of the active one', async () => {
    setSession(SESSION)
    setActiveShopId(2)
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(201, {})))

    await apiRequest('/open-sales', { method: 'POST', body: {}, shopId: 1 })

    expect(shopHeaderOf(fetchMock.mock.calls[0])).toBe('1')
  })

  it('sends the override even when no shop is selected at all', async () => {
    setSession(SESSION)
    const fetchMock = mockFetchByPath(() => Promise.resolve(jsonResponse(201, {})))

    await apiRequest('/open-sales', { method: 'POST', body: {}, shopId: 3 })

    expect(shopHeaderOf(fetchMock.mock.calls[0])).toBe('3')
  })

  it('keeps the override across a refreshed retry', async () => {
    // Dropping it here would land a retried offline sync in the active shop,
    // through the one path nobody looks at.
    setSession(SESSION)
    setActiveShopId(2)

    const fetchMock = mockFetchByPath((url, options) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve(
          jsonResponse(200, {
            accessToken: 'access-2',
            user: SESSION.user,
            shops: SESSION.shops,
          })
        )
      }
      return Promise.resolve(
        options.headers.Authorization === 'Bearer access-1'
          ? jsonResponse(401, {})
          : jsonResponse(201, {})
      )
    })

    await apiRequest('/open-sales', { method: 'POST', body: {}, shopId: 1 })

    expect(shopHeaderOf(fetchMock.mock.calls.at(-1))).toBe('1')
  })
})

/**
 * The recovery path for a shop that is no longer this user's to act on: an
 * assignment revoked mid-session, or a stored id that went stale between two
 * page loads. Keeping it selected would 403 every query on the page forever.
 */
describe('apiRequest — a 403 on the shop', () => {
  beforeEach(() => {
    localStorage.clear()
    clearSession()
    vi.clearAllMocks()
    vi.stubGlobal('location', { ...window.location, assign: vi.fn() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearSession()
    localStorage.clear()
  })

  it('clears the shop and returns to the picker when the shop is not assigned', async () => {
    setSession(SESSION)
    setActiveShopId(9)
    mockFetchByPath(() =>
      Promise.resolve(
        jsonResponse(403, { message: 'You are not assigned to that shop' })
      )
    )

    await apiRequest('/inventory')

    expect(getActiveShopId()).toBeNull()
    expect(window.location.assign).toHaveBeenCalledWith('/select-shop')
    // The session survives: it is the shop that went stale, not the sign-in.
    expect(getSession()).not.toBeNull()
  })

  /**
   * requireRole answers 403 too, and the two need opposite handling. Clearing
   * the shop because a worker opened a manager-only page would bounce them to
   * the picker and lose their selection over a page they were never allowed to
   * see — while leaving the real problem unreported.
   */
  it('leaves the shop alone for a role refusal, which is a different 403', async () => {
    setSession(SESSION)
    setActiveShopId(9)
    mockFetchByPath(() =>
      Promise.resolve(
        jsonResponse(403, { message: 'You do not have access to this action' })
      )
    )

    await expect(apiRequest('/inventory')).rejects.toThrow(
      'You do not have access to this action'
    )
    expect(getActiveShopId()).toBe(9)
    expect(window.location.assign).not.toHaveBeenCalled()
  })

  /**
   * A third 403, and the recovery above is wrong for it.
   *
   * An offline sync names a shop of its own — the branch a queued sale was taken
   * at, which the user may since have lost access to. Clearing the *selection*
   * over that would eject the cashier out of the shop they are standing in, over
   * a row they cannot sync from anywhere. The offline page renders it against
   * the row instead.
   */
  it('leaves the selection alone when the refused shop was an override', async () => {
    setSession(SESSION)
    setActiveShopId(2)
    mockFetchByPath(() =>
      Promise.resolve(
        jsonResponse(403, { message: 'You are not assigned to that shop' })
      )
    )

    await expect(
      apiRequest('/open-sales', { method: 'POST', body: {}, shopId: 9 })
    ).rejects.toThrow('You are not assigned to that shop')

    expect(getActiveShopId()).toBe(2)
    expect(window.location.assign).not.toHaveBeenCalled()
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
