import { createHash, createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminConfigured, isAdmin, login, logout, requireAdmin, requireSameOrigin } from './admin-auth.server'

const request = vi.hoisted(() => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  getRequestHeader: vi.fn(),
  getRequestUrl: vi.fn(),
  config: { ADMIN_PASSWORD: undefined as string | undefined },
}))
vi.mock('@tanstack/solid-start/server', () => ({
  getCookie: request.getCookie,
  setCookie: request.setCookie,
  deleteCookie: request.deleteCookie,
  getRequestHeader: request.getRequestHeader,
  getRequestUrl: request.getRequestUrl,
}))
vi.mock('./env.server', () => ({ env: () => request.config }))

const PASSWORD = 'test-only-admin-password'
const MAX_AGE_SECONDS = 8 * 60 * 60
// Sign deliberately malformed/expired fixtures without ever consulting process.env.
function tokenForBody(body: string, password = PASSWORD) {
  const key = createHash('sha256').update(password).digest()
  const signature = createHmac('sha256', key).update(body).digest('base64url')
  return `${body}.${signature}`
}
function signedPayload(payload: unknown, password = PASSWORD) {
  return tokenForBody(Buffer.from(JSON.stringify(payload)).toString('base64url'), password)
}
function issuedToken(): string {
  return request.setCookie.mock.calls[0]![1] as string
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  request.config.ADMIN_PASSWORD = PASSWORD
  request.getCookie.mockReturnValue(undefined)
  request.getRequestHeader.mockReturnValue('https://search.example.test')
  request.getRequestUrl.mockReturnValue(new URL('https://search.example.test/admin'))
})
afterEach(() => vi.useRealTimers())

describe('admin login and cookies', () => {
  it('reports whether an admin password is configured', () => {
    expect(adminConfigured()).toBe(true)
    request.config.ADMIN_PASSWORD = undefined
    expect(adminConfigured()).toBe(false)
    expect(isAdmin()).toBe(false)
    expect(() => requireAdmin()).toThrow('unauthorized')
  })

  it('refuses login without configuration and never sets a cookie', () => {
    request.config.ADMIN_PASSWORD = undefined
    expect(() => login(PASSWORD)).toThrow('adminNotConfigured')
    expect(request.setCookie).not.toHaveBeenCalled()
  })

  it.each(['', 'wrong', 'x'.repeat(200), `${PASSWORD} `])('refuses an incorrect password %j', password => {
    expect(() => login(password)).toThrow('wrongPassword')
    expect(request.setCookie).not.toHaveBeenCalled()
  })

  it('issues a signed HttpOnly cookie, authenticates it, and expires it after eight hours', () => {
    login(PASSWORD)
    expect(request.setCookie).toHaveBeenCalledWith('remix-admin', expect.any(String), {
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      path: '/',
      maxAge: MAX_AGE_SECONDS,
    })
    const token = issuedToken()
    expect(token.split('.')).toHaveLength(2)
    const payload = JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString())
    expect(payload).toMatchObject({
      exp: Date.now() + MAX_AGE_SECONDS * 1000,
      nonce: expect.stringMatching(/^[a-f0-9]{32}$/),
    })
    request.getCookie.mockReturnValue(token)
    expect(isAdmin()).toBe(true)
    expect(request.getCookie).toHaveBeenCalledWith('remix-admin')
    expect(() => requireAdmin()).not.toThrow()
    vi.setSystemTime(payload.exp - 1)
    expect(isAdmin()).toBe(true)
    vi.setSystemTime(payload.exp)
    expect(isAdmin()).toBe(false)
    expect(() => requireAdmin()).toThrow('unauthorized')
  })

  it('sets secure=false for an HTTP deployment and gives each login a distinct nonce', () => {
    request.getRequestUrl.mockReturnValue(new URL('http://localhost:3000/admin'))
    request.getRequestHeader.mockReturnValue('http://localhost:3000')
    login(PASSWORD)
    login(PASSWORD)
    expect(request.setCookie.mock.calls[0]![2]).toMatchObject({ secure: false })
    expect(request.setCookie.mock.calls[0]![1]).not.toBe(request.setCookie.mock.calls[1]![1])
  })

  it('invalidates an existing cookie when the configured password changes', () => {
    login(PASSWORD)
    request.getCookie.mockReturnValue(issuedToken())
    expect(isAdmin()).toBe(true)
    request.config.ADMIN_PASSWORD = 'different-test-only-password'
    expect(isAdmin()).toBe(false)
  })

  it.each([undefined, '', 'no-dot', '.signature', 'body.', 'x'.repeat(513)])(
    'rejects malformed or oversized cookie %j',
    cookie => {
      request.getCookie.mockReturnValue(cookie)
      expect(isAdmin()).toBe(false)
    },
  )

  it('rejects tampered payloads, tampered signatures, and cookies signed with another password', () => {
    login(PASSWORD)
    const [body, signature] = issuedToken().split('.')
    const otherBody = Buffer.from(JSON.stringify({ exp: Date.now() + 1000, nonce: 'tampered' })).toString('base64url')
    for (const token of [
      `${otherBody}.${signature}`,
      `${body}.x${signature}`,
      signedPayload({ exp: Date.now() + 1000 }, 'wrong-test-password'),
    ]) {
      request.getCookie.mockReturnValue(token)
      expect(isAdmin()).toBe(false)
    }
  })

  it.each<[string, () => unknown]>([
    ['expired', () => ({ exp: Date.now() - 1 })],
    ['at expiry', () => ({ exp: Date.now() })],
    ['beyond maximum age', () => ({ exp: Date.now() + MAX_AGE_SECONDS * 1000 + 1 })],
    ['string expiry', () => ({ exp: String(Date.now() + 1000) })],
    ['missing expiry', () => ({ nonce: 'test' })],
    ['null payload', () => null],
  ])('rejects a correctly signed cookie with %s', (_label, payload) => {
    request.getCookie.mockReturnValue(signedPayload(payload()))
    expect(isAdmin()).toBe(false)
  })

  it('rejects a correctly signed body that is not JSON', () => {
    request.getCookie.mockReturnValue(tokenForBody(Buffer.from('{invalid').toString('base64url')))
    expect(isAdmin()).toBe(false)
  })
})

describe('admin mutation origin protection', () => {
  it('permits the same origin even when request paths differ', () => {
    request.getRequestUrl.mockReturnValue(new URL('https://search.example.test/api/settings?tab=engines'))
    expect(() => requireSameOrigin()).not.toThrow()
    expect(request.getRequestHeader).toHaveBeenCalledWith('origin')
  })

  it('permits requests with no Origin header', () => {
    request.getRequestHeader.mockReturnValue(undefined)
    expect(() => requireSameOrigin()).not.toThrow()
  })

  it.each([
    'https://other.example.test',
    'http://search.example.test',
    'https://search.example.test:444',
    'https://search.example.test.evil.test',
    'null',
  ])('rejects cross-origin mutation from %s before setting or deleting a cookie', origin => {
    request.getRequestHeader.mockReturnValue(origin)
    expect(() => requireSameOrigin()).toThrow('crossSite')
    expect(() => login(PASSWORD)).toThrow('crossSite')
    expect(() => logout()).toThrow('crossSite')
    expect(request.setCookie).not.toHaveBeenCalled()
    expect(request.deleteCookie).not.toHaveBeenCalled()
  })

  it('logs out by deleting the admin cookie at the same path', () => {
    logout()
    expect(request.deleteCookie).toHaveBeenCalledExactlyOnceWith('remix-admin', { path: '/' })
  })
})
