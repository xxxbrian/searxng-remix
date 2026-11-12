import { z } from 'zod'
import { AppError } from '~/lib/errors'
import type { EngineHealth, EngineInfo, LanguageOption, SearxngStatus, Settings } from '~/lib/settings'
import type { Tab } from '~/lib/types'
import { TtlCache } from './cache.server'
import { env } from './env.server'

const catalogSchema = z.object({
  engines: z.array(
    z.object({
      name: z.string(),
      categories: z.array(z.string()),
      enabled: z.boolean(),
      paging: z.boolean().default(false),
      language_support: z.boolean().default(false),
      time_range_support: z.boolean().default(false),
      languages: z.array(z.string()).default([]),
      regions: z.array(z.string()).default([]),
    }),
  ),
  locales: z.record(z.string(), z.string()),
})
const cache = new TtlCache<{ engines: EngineInfo[]; languages: LanguageOption[] }>(30_000, 1)

export function getCatalog() {
  return cache.get('catalog', async () => {
    const res = await fetch(new URL('/config', env().SEARXNG_URL), { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new AppError('catalogUnavailable')
    const raw = catalogSchema.parse(await res.json())
    const languageCodes = new Set([
      ...Object.keys(raw.locales),
      ...raw.engines.flatMap(e => [...e.languages, ...e.regions]),
    ])
    const names = new Intl.DisplayNames(['en'], { type: 'language' })
    const languages = new Map<string, string>()
    for (const rawCode of languageCodes) {
      if (rawCode === 'all' || !/^[a-z]{2,3}(?:[-_][A-Za-z0-9]{2,8}){0,2}$/.test(rawCode)) continue
      try {
        const code = Intl.getCanonicalLocales(rawCode.replaceAll('_', '-'))[0]
        if (code) languages.set(code, names.of(code) ?? code)
      } catch {
        /* Ignore non-language sentinel values such as "clear". */
      }
    }
    return {
      engines: raw.engines.map(e => ({
        name: e.name,
        categories: e.categories,
        enabled: e.enabled,
        paging: e.paging,
        languageSupport: e.language_support,
        timeRangeSupport: e.time_range_support,
      })),
      languages: [...languages].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name)),
    }
  })
}

export const CATEGORY: Record<Tab, string> = {
  all: 'general',
  images: 'images',
  videos: 'videos',
  news: 'news',
  science: 'science',
  it: 'it',
}

/** Respect category and pagination capabilities before issuing upstream requests. */
export function selectedEngines(engines: EngineInfo[], settings: Settings, tab: Tab, page: number, time: string) {
  return engines.filter(
    engine =>
      (settings.engines[engine.name]?.enabled ?? engine.enabled) &&
      engine.categories.includes(CATEGORY[tab]) &&
      (page === 1 || engine.paging) &&
      (time === 'any' || engine.timeRangeSupport),
  )
}

const health = new Map<string, EngineHealth>()
export const getEngineHealth = (): Record<string, EngineHealth> => Object.fromEntries(health)

/** Observations come from actual searches, never from the enabled flag. */
export function recordHealth(successful: string[], errors: Array<[string, string]>) {
  const now = new Date().toISOString()
  for (const name of new Set(successful)) {
    health.set(name, { ...health.get(name), checkedAt: now, lastSuccessAt: now, error: undefined })
  }
  for (const [name, error] of errors) {
    health.set(name, { ...health.get(name), checkedAt: now, lastFailureAt: now, error })
  }
}

/** Read-only view of the upstream. Low-level SearXNG settings stay in settings.yml. */
export async function searxngStatus(): Promise<SearxngStatus> {
  const url = env().SEARXNG_URL
  const started = performance.now()
  try {
    const res = await fetch(new URL('/config', url), { signal: AbortSignal.timeout(5000) })
    const ms = Math.round(performance.now() - started)
    if (!res.ok) return { url, ok: false, ms, error: `HTTP ${res.status}` }
    const raw = z
      .looseObject({
        version: z.string().optional(),
        instance_name: z.string().optional(),
        safe_search: z.number().optional(),
        engines: z.array(z.looseObject({ enabled: z.boolean() })).default([]),
        plugins: z.array(z.looseObject({ name: z.string(), enabled: z.boolean().optional() })).default([]),
      })
      .parse(await res.json())
    return {
      url,
      ok: true,
      ms,
      version: raw.version,
      instance: raw.instance_name,
      safeSearch: raw.safe_search,
      engines: raw.engines.length,
      enabledEngines: raw.engines.filter(e => e.enabled).length,
      plugins: raw.plugins.map(p => p.name),
    }
  } catch (error) {
    return {
      url,
      ok: false,
      ms: Math.round(performance.now() - started),
      error: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unreachable',
    }
  }
}
