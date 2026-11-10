import { z } from 'zod'
import { resolveSearchLanguage } from '~/lib/locale'
import type { Settings } from '~/lib/settings'
import { isChinese } from '~/lib/text'
import type { Hit, InfoboxData, Lang, SearchPage, Tab, TimeRange } from '~/lib/types'
import { TtlCache, TtlCachePool } from './cache.server'
import { getCatalog, recordHealth, selectedEngines } from './catalog.server'
import { env } from './env.server'
import { cleanUrl, rank } from './ranking.server'
import { readSettings } from './settings.server'
import { recordEngineCalls } from './usage.server'

export interface SearchQuery {
  q: string
  tab: Tab
  page: number
  time: TimeRange
  lang: Lang
  /** Trusted request context, attached by the server function. */
  browserLanguage?: string
}

const text = z.string().nullish()
const rawResult = z.looseObject({
  url: z.string(),
  title: z
    .string()
    .nullish()
    .transform(v => v ?? ''),
  content: z
    .string()
    .nullish()
    .transform(v => v ?? ''),
  publishedDate: text,
  thumbnail: text,
  thumbnail_src: text,
  img_src: text,
  author: text,
  source: text,
  resolution: text,
  length: z.union([z.string(), z.number()]).nullish(),
  engines: z.array(z.string()).default([]),
  engine: text,
})
const rawInfobox = z.looseObject({
  infobox: z.string(),
  content: z.string().default(''),
  img_src: text,
  urls: z.array(z.looseObject({ title: z.string(), url: z.string() })).default([]),
  attributes: z.array(z.looseObject({ label: z.string(), value: z.unknown() })).default([]),
})
const rawResponse = z.looseObject({
  results: z.array(rawResult),
  answers: z.array(z.union([z.string(), z.looseObject({ answer: z.string() })])).default([]),
  infoboxes: z.array(rawInfobox).default([]),
  suggestions: z.array(z.string()).default([]),
  corrections: z.array(z.string()).default([]),
  unresponsive_engines: z.array(z.tuple([z.string(), z.string()])).default([]),
})
type RawResponse = z.infer<typeof rawResponse>
interface EngineGroup {
  language: string
  engines: string[]
}

async function fetchRaw(query: SearchQuery, group: EngineGroup, settings: Settings): Promise<RawResponse> {
  const url = new URL('/search', env().SEARXNG_URL)
  url.search = new URLSearchParams({
    // A categories parameter adds that category's default engines in SearXNG.
    // Explicit engines already encode our category and must remain authoritative.
    q: query.q,
    format: 'json',
    engines: group.engines.join(','),
    pageno: String(query.page),
    language: group.language,
    safesearch: String(settings.safeSearch),
    ...(query.time !== 'any' && { time_range: query.time }),
  }).toString()
  const res = await fetch(url, { signal: AbortSignal.timeout(settings.limits.upstreamTimeoutSec * 1000) })
  if (!res.ok) throw new Error(`SearXNG responded ${res.status}`)
  return rawResponse.parse(await res.json())
}

/** Only absolute HTTP(S) media URLs cross the server boundary. */
function httpUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}

function crumbsOf(url: URL, host: string): string {
  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    .slice(0, 3)
    .map(s => {
      try {
        return decodeURIComponent(s)
      } catch {
        return s
      }
    })
  return [host, ...segments].join(' › ')
}

function duration(value: string | number | null | undefined): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value !== 'number' || value < 0 || !Number.isFinite(value)) return undefined
  const seconds = Math.floor(value)
  const minutes = Math.floor(seconds / 60)
  return minutes < 60
    ? `${minutes}:${String(seconds % 60).padStart(2, '0')}`
    : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function toHit(raw: z.infer<typeof rawResult>): Hit | undefined {
  const cleaned = cleanUrl(raw.url)
  if (!cleaned) return undefined
  const url = new URL(cleaned)
  const host = url.hostname.replace(/^www\./, '')
  const snippet = raw.content.replace(/\s+/g, ' ').trim()
  return {
    url: cleaned,
    title: raw.title.trim() || host,
    snippet: snippet.length > 280 ? `${snippet.slice(0, 280)}…` : snippet,
    host,
    crumbs: crumbsOf(url, host),
    publishedDate: raw.publishedDate ?? undefined,
    // Empty thumbnail strings must not hide a valid thumbnail_src.
    thumbnail: httpUrl(raw.thumbnail) || httpUrl(raw.thumbnail_src) || httpUrl(raw.img_src),
    imageSrc: httpUrl(raw.img_src),
    author: raw.author || undefined,
    source: raw.source || undefined,
    resolution: raw.resolution || undefined,
    duration: duration(raw.length),
    engines: raw.engines.length ? raw.engines : raw.engine ? [raw.engine] : [],
  }
}

function toInfobox(raw: z.infer<typeof rawInfobox> | undefined): InfoboxData | undefined {
  if (!raw) return undefined
  return {
    title: raw.infobox,
    content: raw.content,
    image: httpUrl(raw.img_src),
    attributes: raw.attributes.flatMap(({ label, value }) =>
      typeof value === 'string' && value ? [{ label, value }] : [],
    ),
    links: raw.urls.flatMap(({ title, url }) => (httpUrl(url) ? [{ title, url }] : [])),
  }
}

const searchCaches = new TtlCachePool<SearchPage>()

export async function search(query: SearchQuery): Promise<SearchPage> {
  return (await searchTraced(query)).page
}

/** Also reports whether the page came from cache, for the usage log. */
export async function searchTraced(query: SearchQuery): Promise<{ page: SearchPage; cached: boolean }> {
  const [snapshot, catalog] = await Promise.all([readSettings(), getCatalog()])
  const language = resolveSearchLanguage(
    query.q,
    query.lang,
    query.browserLanguage ?? '',
    catalog.languages,
    snapshot.settings.defaultLanguage,
  )
  const chosen = selectedEngines(catalog.engines, snapshot.settings, query.tab, query.page, query.time)
  const groups = new Map<string, string[]>()
  for (const engine of chosen) {
    // DDG web's Chinese region has no next page. Keep its region stable from
    // page one, without removing language preferences from every other engine.
    const locale = engine.name === 'duckduckgo' && language.startsWith('zh') ? 'all' : language
    groups.set(locale, [...(groups.get(locale) ?? []), engine.name])
  }
  const requests = [...groups].map(([language, engines]) => ({ language, engines }))
  const key = JSON.stringify({ ...query, browserLanguage: undefined, language, revision: snapshot.revision, requests })
  let cached = true
  const load = () => {
    cached = false
    return run(query, requests, snapshot.settings, language)
  }
  const minutes = snapshot.settings.limits.cacheMinutes
  const page =
    minutes === 0
      ? await load()
      : await searchCaches.forMinutes(minutes).get(key, load, page => page.hits.length > 0 || !page.degraded)
  return { page, cached }
}

async function run(
  query: SearchQuery,
  groups: EngineGroup[],
  settings: Settings,
  language: string,
): Promise<SearchPage> {
  const started = performance.now()
  const settled = await Promise.allSettled(groups.map(group => fetchRaw(query, group, settings)))
  const responses = settled.flatMap(result => (result.status === 'fulfilled' ? [result.value] : []))
  const transportErrors: Array<[string, string]> = settled.flatMap((result, i) =>
    result.status === 'rejected' ? groups[i]!.engines.map(name => [name, 'unreachable'] as [string, string]) : [],
  )
  const errors = [...responses.flatMap(r => r.unresponsive_engines), ...transportErrors]
  const hits = responses.flatMap(r => r.results.flatMap(raw => toHit(raw) ?? []))
  recordHealth(
    hits.flatMap(h => [...(h.engines ?? [])]),
    errors,
  )
  const failedEngines = [...new Set(errors.map(([name]) => name))]
  const returned = new Map<string, number>()
  for (const hit of hits) for (const name of hit.engines ?? []) returned.set(name, (returned.get(name) ?? 0) + 1)
  void recordEngineCalls(
    groups
      .flatMap(group => group.engines)
      .map(engine => ({
        engine,
        ok: !failedEngines.includes(engine),
        results: returned.get(engine) ?? 0,
        error: errors.find(([name]) => name === engine)?.[1],
      })),
  )
  return {
    query: query.q,
    language,
    tab: query.tab,
    page: query.page,
    hits: rank(hits, { preferChinese: isChinese(query.q), policy: settings, engineWeights: settings.engines }),
    answers: [...new Set(responses.flatMap(r => r.answers.map(a => (typeof a === 'string' ? a : a.answer))))],
    infobox: toInfobox(responses.flatMap(r => r.infoboxes)[0]),
    suggestions: [...new Set(responses.flatMap(r => r.suggestions))].slice(0, 8),
    correction: responses.flatMap(r => r.corrections)[0],
    elapsedMs: Math.round(performance.now() - started),
    failedEngines,
    degraded: !groups.length || errors.length > 0,
  }
}

const suggestCache = new TtlCache<string[]>(10 * 60_000, 1000)

export function suggest(q: string): Promise<string[]> {
  return suggestCache.get(q.toLowerCase(), async () => {
    const url = new URL('/autocompleter', env().SEARXNG_URL)
    url.searchParams.set('q', q)
    const res = await fetch(url, { signal: AbortSignal.timeout(3_000) })
    if (!res.ok) return []
    const body: unknown = await res.json()
    const list = Array.isArray(body) ? body[1] : []
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string').slice(0, 8) : []
  })
}
