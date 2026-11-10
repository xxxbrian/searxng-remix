import { createServerFn } from '@tanstack/solid-start'
import { getRequestHeader } from '@tanstack/solid-start/server'
import { z } from 'zod'
import { AppError } from '~/lib/errors'
import { resolveUiLocale } from '~/lib/locale'
import { parseSearchParams, type SearchParams } from '~/lib/search-params'
import type { PublicContext } from '~/lib/settings'
import { streamSummary, type TokenUsage } from './ai.server'
import { getCatalog } from './catalog.server'
import { classifyQuery } from './intent.server'
import { liveCard } from './live.server'
import { resolveEndpoint } from './models.server'
import { rateLimit } from './rate-limit'
import { search, searchTraced, suggest } from './searxng.server'
import { readSettings } from './settings.server'
import { measure, recordUsage } from './usage.server'

/** Full results page. Called from the route loader (SSR) and on client navigation. */
export const searchFn = createServerFn({ method: 'GET' })
  .middleware([rateLimit('searchPerMinute')])
  .validator((input: SearchParams) => parseSearchParams(input))
  .handler(async ({ data }) => {
    const { page } = await measure(
      { kind: 'search', query: data.q, tab: data.tab, page: data.page, lang: data.lang },
      () => searchTraced({ ...data, browserLanguage: getRequestHeader('accept-language') }),
      ({ page, cached }) => ({
        lang: page.language,
        cached,
        results: page.hits.length,
        detail: {
          time: data.time,
          requestedLang: data.lang,
          degraded: page.degraded,
          failedEngines: page.failedEngines,
          upstreamMs: page.elapsedMs,
        },
      }),
    )
    return page
  })

export const classifyQueryFn = createServerFn({ method: 'GET' })
  .middleware([rateLimit('intentPerMinute')])
  .validator(z.object({ q: z.string().trim().min(1).max(200) }))
  .handler(({ data }) => classifyQuery(data.q))

/** Structured live data (weather, local time). Returns null rather than failing the page. */
export const liveCardFn = createServerFn({ method: 'GET' })
  .middleware([rateLimit('livePerMinute')])
  .validator(z.object({ q: z.string().trim().min(1).max(200), kind: z.enum(['weather', 'time']) }))
  .handler(async ({ data }) => {
    const acceptLanguage = getRequestHeader('accept-language') ?? ''
    const language = resolveUiLocale(acceptLanguage)
    return liveCard(data.q, data.kind, (await readSettings()).settings, language, acceptLanguage)
  })

export const suggestFn = createServerFn({ method: 'GET' })
  .middleware([rateLimit('suggestPerMinute')])
  .validator(z.object({ q: z.string().trim().min(1).max(100) }))
  .handler(({ data }) =>
    measure(
      { kind: 'suggest', query: data.q },
      () => suggest(data.q),
      list => ({ results: list.length }),
    ),
  )

export type SummaryEvent =
  | { type: 'sources'; sources: ReadonlyArray<{ title: string; url: string; host: string }> }
  | { type: 'delta'; text: string }

/** Streams the AI answer. Sources come from the (cached) search, never from the client. */
export const summarizeFn = createServerFn({ method: 'POST' })
  .middleware([rateLimit('summaryPerMinute')])
  .validator((input: Pick<SearchParams, 'q' | 'lang'>) => parseSearchParams(input))
  .handler(async function* ({ data }): AsyncGenerator<SummaryEvent> {
    const { settings } = await readSettings()
    const endpoint = settings.aiEnabled ? await resolveEndpoint('ai', settings) : null
    if (!endpoint) throw new AppError('aiUnavailable')
    const page = await search({
      q: data.q,
      lang: data.lang,
      tab: 'all',
      page: 1,
      time: 'any',
      browserLanguage: getRequestHeader('accept-language'),
    })
    const sources = page.hits.slice(0, settings.ai.sourceCount)
    yield { type: 'sources', sources: sources.map(({ title, url, host }) => ({ title, url, host })) }
    const started = performance.now()
    let firstTokenMs: number | undefined
    let chars = 0
    let usage: TokenUsage | undefined
    let failure: unknown
    let completed = false
    try {
      for await (const text of streamSummary(endpoint, settings.ai, data.q, sources, page.language, u => {
        usage = u
      })) {
        firstTokenMs ??= Math.round(performance.now() - started)
        chars += text.length
        yield { type: 'delta', text }
      }
      completed = true
    } catch (error) {
      failure = error
      throw error
    } finally {
      // A client that navigates away closes the generator: logged as incomplete, not as an error.
      void recordUsage({
        kind: 'summary',
        query: data.q,
        lang: page.language,
        ms: performance.now() - started,
        ok: completed,
        model: endpoint.model,
        results: sources.length,
        tokensIn: usage?.input,
        tokensOut: usage?.output,
        error: failure instanceof Error ? failure.message : undefined,
        detail: { firstTokenMs, chars, aborted: !completed && !failure },
      })
    }
  })

/** Only non-sensitive, request-scoped UI preferences cross this boundary. */
export const getPublicContextFn = createServerFn({ method: 'GET' }).handler(async (): Promise<PublicContext> => {
  const [{ settings }, catalog] = await Promise.all([
    readSettings(),
    getCatalog().catch(() => ({
      languages: [
        { code: 'en', name: 'English' },
        { code: 'zh-CN', name: '简体中文' },
        { code: 'ja', name: '日本語' },
        { code: 'de', name: 'Deutsch' },
      ],
    })),
  ])
  return {
    locale: resolveUiLocale(getRequestHeader('accept-language') ?? ''),
    languages: [{ code: 'all', name: 'All languages' }, ...catalog.languages],
    aiEnabled: settings.aiEnabled && Boolean(await resolveEndpoint('ai', settings)),
    aiAuto: settings.aiAuto,
  }
})
