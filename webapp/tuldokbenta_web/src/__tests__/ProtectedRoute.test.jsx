/**
 * Property-based tests for ProtectedRoute password comparison logic.
 *
 * Feature: frontend-code-cleanup
 * Property 8: Correct password grants access; any other string denies it
 * Validates: Requirements 4.2, 4.3, 4.4
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import * as fc from 'fast-check'

// ProtectedRoute uses react-router-dom's <Navigate>; stub it out.
vi.mock('react-router-dom', () => ({
  Navigate: () => null,
}))

// ---------------------------------------------------------------------------
// Helper: render ProtectedRoute with a given env var value, submit a password,
// and return whether access was granted (localStorage set + no error shown).
//
// Always calls cleanup() so the DOM is clear for the next iteration —
// critical when this helper is called inside a property test loop.
// ---------------------------------------------------------------------------
async function attemptLogin(adminPasswordEnvValue, submitted) {
  // Control the env var before importing the component so import.meta.env
  // reflects the stub.
  if (adminPasswordEnvValue !== undefined) {
    vi.stubEnv('VITE_ADMIN_PASSWORD', adminPasswordEnvValue)
  } else {
    vi.unstubAllEnvs()
  }

  // Fresh module so the component closes over the updated env.
  vi.resetModules()
  const { default: ProtectedRoute } = await import('../components/ProtectedRoute.jsx')

  localStorage.clear()

  try {
    render(
      <ProtectedRoute>
        <div data-testid="protected-content" />
      </ProtectedRoute>
    )

    // Fill in and submit the password form.
    const input = screen.getByPlaceholderText('Enter password')
    fireEvent.change(input, { target: { value: submitted } })
    fireEvent.submit(input.closest('form'))

    return localStorage.getItem('authenticated') === 'true'
  } finally {
    // Always unmount so successive calls don't accumulate DOM nodes.
    cleanup()
  }
}

// ---------------------------------------------------------------------------
// Reset between each test so module cache and env stubs don't bleed across.
// ---------------------------------------------------------------------------
beforeEach(() => {
  localStorage.clear()
  vi.unstubAllEnvs()
  vi.resetModules()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// Example-based baseline
// ---------------------------------------------------------------------------
describe('ProtectedRoute — example-based baseline', () => {
  it('grants access when correct password is submitted', async () => {
    const granted = await attemptLogin('secret123', 'secret123')
    expect(granted).toBe(true)
  })

  it('denies access when wrong password is submitted', async () => {
    const granted = await attemptLogin('secret123', 'wrongpassword')
    expect(granted).toBe(false)
  })

  it('denies access when VITE_ADMIN_PASSWORD is not set (fail-closed)', async () => {
    const granted = await attemptLogin(undefined, '')
    expect(granted).toBe(false)
  })

  it('denies access even with non-empty submission when env var is not set', async () => {
    const granted = await attemptLogin(undefined, 'anypassword')
    expect(granted).toBe(false)
  })

  it('shows error message on wrong password', async () => {
    vi.stubEnv('VITE_ADMIN_PASSWORD', 'correct')
    vi.resetModules()
    const { default: ProtectedRoute } = await import('../components/ProtectedRoute.jsx')

    localStorage.clear()
    render(
      <ProtectedRoute>
        <div />
      </ProtectedRoute>
    )

    const input = screen.getByPlaceholderText('Enter password')
    fireEvent.change(input, { target: { value: 'wrong' } })
    fireEvent.submit(input.closest('form'))

    expect(screen.getByText('Incorrect password.')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Property 8: Correct password grants access; any other string denies it
// ---------------------------------------------------------------------------
describe('Property 8 — password comparison logic', () => {
  /**
   * P8a: For any non-empty password string p, submitting p when VITE_ADMIN_PASSWORD=p
   * must grant access.
   */
  it('P8a: correct password always grants access for any non-empty password string', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (p) => {
          const granted = await attemptLogin(p, p)
          return granted === true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * P8b: For any two distinct non-empty strings p and q, submitting q when
   * VITE_ADMIN_PASSWORD=p must deny access.
   */
  it('P8b: a different password always denies access', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate two distinct non-empty strings via .filter()
        fc
          .tuple(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }))
          .filter(([p, q]) => p !== q),
        async ([p, q]) => {
          const granted = await attemptLogin(p, q)
          return granted === false
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * P8c: When VITE_ADMIN_PASSWORD is undefined, any submission (including empty)
   * must be denied — fail-closed.
   */
  it('P8c: when VITE_ADMIN_PASSWORD is undefined, all submissions are denied', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(), // any string, including empty
        async (submitted) => {
          const granted = await attemptLogin(undefined, submitted)
          return granted === false
        }
      ),
      { numRuns: 100 }
    )
  })
})
