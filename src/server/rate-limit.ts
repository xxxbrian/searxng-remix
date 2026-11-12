import { createMiddleware } from '@tanstack/solid-start'
import { getRequestHeader } from '@tanstack/solid-start/server'
import { AppError } from '~/lib/errors'
import type { Settings } from '~/lib/settings'

/** Fixed-window limiter per client IP. A settings key makes the limit adjustable in the admin. */
export function rateLimit(limit: number | keyof Settings['limits'], windowMs = 60_000) {
  const windows = new Map<string, { count: number; resetAt: number }>()

  return createMiddleware({ type: 'function' }).server(async ({ next }) => {
    const ip = getRequestHeader('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
    // The settings store is server-only: load it inside the server callback.
    const max =
      typeof limit === 'number'
        ? limit
        : (await (await import('./settings.server')).readSettings()).settings.limits[limit]
    const now = Date.now()
    const w = windows.get(ip)

    if (!w || w.resetAt <= now) {
      windows.set(ip, { count: 1, resetAt: now + windowMs })
      if (windows.size > 5_000) for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k)
    } else if (++w.count > max) {
      throw new AppError('rateLimited')
    }
    return next()
  })
}
