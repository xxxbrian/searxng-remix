import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { deleteCookie, getCookie, getRequestHeader, getRequestUrl, setCookie } from '@tanstack/solid-start/server'
import { AppError } from '~/lib/errors'
import { env } from './env.server'

const COOKIE = 'remix-admin'
const MAX_AGE = 8 * 60 * 60
const digest = (value: string) => createHash('sha256').update(value).digest()
const sign = (value: string, password: string) =>
  createHmac('sha256', digest(password)).update(value).digest('base64url')

export function adminConfigured() {
  return Boolean(env().ADMIN_PASSWORD)
}

export function isAdmin(): boolean {
  const password = env().ADMIN_PASSWORD
  const token = getCookie(COOKIE)
  if (!password || !token || token.length > 512) return false
  const [body, signature] = token.split('.')
  if (!body || !signature) return false
  const expected = sign(body, password)
  if (!timingSafeEqual(digest(signature), digest(expected))) return false
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    return typeof payload.exp === 'number' && payload.exp > Date.now() && payload.exp <= Date.now() + MAX_AGE * 1000
  } catch {
    return false
  }
}

export function requireAdmin() {
  if (!isAdmin()) throw new AppError('unauthorized')
}

export function requireSameOrigin() {
  const origin = getRequestHeader('origin')
  if (origin && origin !== new URL(getRequestUrl()).origin) throw new AppError('crossSite')
}

export function login(password: string) {
  requireSameOrigin()
  const actual = env().ADMIN_PASSWORD
  if (!actual) throw new AppError('adminNotConfigured')
  if (!timingSafeEqual(digest(password), digest(actual))) throw new AppError('wrongPassword')
  const body = Buffer.from(
    JSON.stringify({ exp: Date.now() + MAX_AGE * 1000, nonce: randomBytes(16).toString('hex') }),
  ).toString('base64url')
  setCookie(COOKIE, `${body}.${sign(body, actual)}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: new URL(getRequestUrl()).protocol === 'https:',
    path: '/',
    maxAge: MAX_AGE,
  })
}

export function logout() {
  requireSameOrigin()
  deleteCookie(COOKIE, { path: '/' })
}
