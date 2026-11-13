import { createServerFn } from '@tanstack/solid-start'
import { z } from 'zod'
import { AppError, historyToken } from '~/lib/errors'
import type { SystemInfo, UsageKind } from '~/lib/settings'
import { type AdminData, defaultSettings, settingsSchema } from '~/lib/settings'
import { adminConfigured, isAdmin, login, logout, requireAdmin, requireSameOrigin } from './admin-auth.server'
import { getCatalog, getEngineHealth, searxngStatus, selectedEngines } from './catalog.server'
import { env } from './env.server'
import { describeEndpoint, testEndpoint } from './models.server'
import { rateLimit } from './rate-limit'
import { writeSecret } from './secrets.server'
import { readHistory, readSettings, restoreBefore, saveSettings } from './settings.server'
import { clearUsage, usageEvents, usageReport, usageSize } from './usage.server'

const secret = z.union([z.string().trim().min(8).max(500), z.null()]).optional()

async function adminData(): Promise<AdminData> {
  const [snapshot, catalog] = await Promise.all([readSettings(), getCatalog()])
  const [ai, jev] = await Promise.all([
    describeEndpoint('ai', snapshot.settings),
    describeEndpoint('jev', snapshot.settings),
  ])
  return { ...snapshot, ...catalog, health: getEngineHealth(), models: { ai, jev } }
}

export const adminStateFn = createServerFn({ method: 'GET' }).handler(async () => {
  if (!isAdmin()) return { authenticated: false as const, configured: adminConfigured() }
  return { authenticated: true as const, configured: true, data: await adminData() }
})

export const adminLoginFn = createServerFn({ method: 'POST' })
  .middleware([rateLimit(5)])
  .validator(z.object({ password: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    login(data.password)
    return { ok: true }
  })

export const adminLogoutFn = createServerFn({ method: 'POST' }).handler(() => {
  logout()
  return { ok: true }
})

export const saveAdminSettingsFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      revision: z.number().int().min(0),
      settings: settingsSchema,
      /** A string replaces the stored key, null removes it, absent keeps it. */
      secrets: z.object({ ai: secret, jev: secret }).default({}),
    }),
  )
  .handler(async ({ data }) => {
    requireAdmin()
    requireSameOrigin()
    const catalog = await getCatalog()
    const names = new Set(catalog.engines.map(e => e.name))
    if (Object.keys(data.settings.engines).some(name => !names.has(name))) throw new AppError('catalogChanged')
    if (!selectedEngines(catalog.engines, data.settings, 'all', 1, 'any').length) throw new AppError('noWebEngine')
    if (
      !['auto', 'all'].includes(data.settings.defaultLanguage) &&
      !catalog.languages.some(l => l.code === data.settings.defaultLanguage)
    ) {
      throw new AppError('unsupportedLanguage')
    }
    // Secrets change only after the revision check passes; the log names the key, never its value.
    const touched = (['ai', 'jev'] as const).filter(name => data.secrets[name] !== undefined)
    await saveSettings(
      data.settings,
      data.revision,
      touched.map(name => historyToken.secret(name, data.secrets[name] === null)),
    )
    for (const name of touched) await writeSecret(name, data.secrets[name] ?? null)
    return adminData()
  })

export const testEndpointFn = createServerFn({ method: 'POST' })
  .middleware([rateLimit(10)])
  .validator(z.object({ name: z.enum(['ai', 'jev']) }))
  .handler(async ({ data }) => {
    requireAdmin()
    requireSameOrigin()
    return testEndpoint(data.name, (await readSettings()).settings)
  })

export const resetAdminSettingsFn = createServerFn({ method: 'POST' })
  .validator(z.object({ revision: z.number().int().min(0) }))
  .handler(async ({ data }) => {
    requireAdmin()
    requireSameOrigin()
    await saveSettings(defaultSettings(), data.revision, [historyToken.reset()])
    return adminData()
  })

const RANGES = {
  '24h': [86_400_000, 3_600_000],
  '7d': [7 * 86_400_000, 6 * 3_600_000],
  '30d': [30 * 86_400_000, 86_400_000],
} as const
const rangeSchema = z.enum(['24h', '7d', '30d'])

export const usageReportFn = createServerFn({ method: 'GET' })
  .validator(z.object({ range: rangeSchema }))
  .handler(({ data }) => {
    requireAdmin()
    const [span, bucket] = RANGES[data.range]
    return usageReport(Date.now() - span, bucket)
  })

export const usageEventsFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      kind: z.enum(['search', 'suggest', 'intent', 'summary', 'live']).optional(),
      failedOnly: z.boolean().optional(),
      before: z.number().int().positive().optional(),
    }),
  )
  .handler(({ data }) => {
    requireAdmin()
    return usageEvents({ ...data, kind: data.kind as UsageKind | undefined, limit: 50 })
  })

export const clearUsageFn = createServerFn({ method: 'POST' }).handler(() => {
  requireAdmin()
  requireSameOrigin()
  return { removed: clearUsage() }
})

export const systemInfoFn = createServerFn({ method: 'GET' }).handler(async (): Promise<SystemInfo> => {
  requireAdmin()
  const [searxng, history] = await Promise.all([searxngStatus(), readHistory()])
  return {
    searxng,
    history,
    usage: usageSize(),
    node: process.version,
    uptimeSec: Math.round(process.uptime()),
    dataDir: env().DATA_DIR,
  }
})

export const restoreSettingsFn = createServerFn({ method: 'POST' })
  .validator(z.object({ revision: z.number().int().min(1), current: z.number().int().min(0) }))
  .handler(async ({ data }) => {
    requireAdmin()
    requireSameOrigin()
    await restoreBefore(data.revision, data.current)
    return adminData()
  })
