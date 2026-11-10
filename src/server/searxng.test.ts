import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings, type EngineInfo, type SettingsSnapshot } from '~/lib/settings'
import type { SearchQuery } from './searxng.server'

const mocks = vi.hoisted(() => ({
  readSettings: vi.fn(),
  getCatalog: vi.fn(),
  recordHealth: vi.fn(),
}))
vi.mock('./env.server', () => ({ env: () => ({ SEARXNG_URL: 'http://searx.test:8888' }) }))
vi.mock('./usage.server', () => ({ recordUsage: async () => undefined, recordEngineCalls: async () => undefined }))
vi.mock('./settings.server', () => ({ readSettings: mocks.readSettings }))
vi.mock('./catalog.server', async importOriginal => ({
  ...(await importOriginal<typeof import('./catalog.server')>()),
  getCatalog: mocks.getCatalog,
  recordHealth: mocks.recordHealth,
}))

const QUERY: SearchQuery = {
  q: '神经网络与深度学习',
  tab: 'all',
  page: 2,
  time: 'any',
  lang: 'auto',
}
const engine = (name: string, overrides: Partial<EngineInfo> = {}): EngineInfo => ({
  name,
  categories: ['general'],
  enabled: true,
  paging: true,
  languageSupport: true,
  timeRangeSupport: true,
  ...overrides,
})
const languages = ['en', 'zh-CN', 'zh-TW', 'de', 'fr', 'ja'].map(code => ({ code, name: code }))
const hit = (url: string, title = 'Neural networks', content = 'Deep learning reference') => ({ url, title, content })
function response(results: object[] = [], errors: [string, string][] = [], extra: object = {}) {
  return Response.json({ results, unresponsive_engines: errors, ...extra })
}
const requests = (fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) =>
  fetchMock.mock.calls.map(([url]) => new URL(String(url)))
let snapshot: SettingsSnapshot
let engines: EngineInfo[]
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  snapshot = { revision: 0, updatedAt: null, settings: defaultSettings() }
  engines = [engine('google')]
  mocks.readSettings.mockImplementation(async () => snapshot)
  mocks.getCatalog.mockImplementation(async () => ({ engines, languages }))
  fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => response())
  vi.stubGlobal('fetch', fetchMock)
})

describe('search engine selection and language', () => {
  it('keeps DDG Chinese requests at all across pages without removing other engines’ language', async () => {
    engines = [engine('duckduckgo'), engine('google')]
    const { search } = await import('./searxng.server')
    const first = await search({ ...QUERY, page: 1 })
    const second = await search(QUERY)

    expect(first.language).toBe('zh-CN')
    expect(second.language).toBe('zh-CN')
    expect(
      requests(fetchMock).map(url => ({
        engines: url.searchParams.get('engines'),
        language: url.searchParams.get('language'),
        page: url.searchParams.get('pageno'),
        query: url.searchParams.get('q'),
      })),
    ).toEqual([
      { engines: 'duckduckgo', language: 'all', page: '1', query: QUERY.q },
      { engines: 'google', language: 'zh-CN', page: '1', query: QUERY.q },
      { engines: 'duckduckgo', language: 'all', page: '2', query: QUERY.q },
      { engines: 'google', language: 'zh-CN', page: '2', query: QUERY.q },
    ])
  })

  it('batches engines with the same language into one request', async () => {
    engines = [engine('google'), engine('bing'), engine('duckduckgo')]
    const { search } = await import('./searxng.server')
    await search({ ...QUERY, q: 'Rust', lang: 'en' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requests(fetchMock)[0]?.searchParams.get('engines')).toBe('google,bing,duckduckgo')
  })

  it('uses settings overrides and respects category, pagination, and time range support', async () => {
    engines = [
      engine('google'),
      engine('disabled', { enabled: false }),
      engine('first-page-only', { paging: false }),
      engine('no-time', { timeRangeSupport: false }),
      engine('images', { categories: ['images'] }),
      engine('turned-off'),
    ]
    snapshot.settings.engines = { disabled: { enabled: true, weight: 1 }, 'turned-off': { enabled: false, weight: 1 } }
    snapshot.settings.safeSearch = 2
    const { search } = await import('./searxng.server')
    await search({ ...QUERY, time: 'week' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = requests(fetchMock)[0]!
    expect(url.origin + url.pathname).toBe('http://searx.test:8888/search')
    expect(url.searchParams.has('categories')).toBe(false)
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      engines: 'google,disabled',
      pageno: '2',
      time_range: 'week',
      safesearch: '2',
      format: 'json',
    })
  })

  it('does not send a time_range parameter for unrestricted searches', async () => {
    const { search } = await import('./searxng.server')
    await search(QUERY)
    expect(requests(fetchMock)[0]?.searchParams.has('time_range')).toBe(false)
  })

  it.each([
    { q: 'Rust', lang: 'auto', browser: 'de-DE;q=0.9,en;q=0.5', configured: 'auto', expected: 'de' },
    { q: '神经网络', lang: 'auto', browser: 'en', configured: 'auto', expected: 'zh-CN' },
    { q: 'how does this work', lang: 'auto', browser: 'de', configured: 'auto', expected: 'en' },
    { q: '神经网络', lang: 'en', browser: 'de', configured: 'fr', expected: 'en' },
    { q: 'Rust', lang: 'zh_TW', browser: 'en', configured: 'auto', expected: 'zh-TW' },
    { q: 'Rust', lang: 'zh', browser: 'en', configured: 'auto', expected: 'zh-CN' },
    { q: '神经网络', lang: 'auto', browser: 'en', configured: 'fr', expected: 'fr' },
    { q: 'Rust', lang: 'xx', browser: 'ja', configured: 'xx', expected: 'ja' },
    { q: 'Rust', lang: 'auto', browser: 'xx,*;q=0.8', configured: 'auto', expected: 'all' },
    { q: '神经网络', lang: 'all', browser: 'en', configured: 'fr', expected: 'all' },
    { q: '神经网络', lang: 'auto', browser: 'en', configured: 'all', expected: 'all' },
  ])(
    'resolves $q / $lang / $browser / default $configured to $expected',
    async ({ q, lang, browser, configured, expected }) => {
      snapshot.settings.defaultLanguage = configured
      const { search } = await import('./searxng.server')
      const page = await search({ ...QUERY, q, lang, browserLanguage: browser })
      expect(page.language).toBe(expected)
      expect(requests(fetchMock)[0]?.searchParams.get('language')).toBe(expected)
    },
  )
})

describe('search failures and caching', () => {
  it('reports a failed empty page as degraded and fetches again on retry', async () => {
    fetchMock
      .mockResolvedValueOnce(response([], [['google', 'access denied']]))
      .mockResolvedValueOnce(response([hit('https://nndl.github.io/')]))
    const { search } = await import('./searxng.server')
    expect(await search(QUERY)).toMatchObject({ hits: [], degraded: true, failedEngines: ['google'] })
    expect(await search(QUERY)).toMatchObject({
      degraded: false,
      hits: [expect.objectContaining({ host: 'nndl.github.io' })],
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('caches successful empty searches', async () => {
    const { search } = await import('./searxng.server')
    const page = await search(QUERY)
    expect(page).toMatchObject({ hits: [], degraded: false, failedEngines: [] })
    expect(await search(QUERY)).toBe(page)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(['http', 'network', 'schema'] as const)(
    'retries empty %s failures and attributes them to the requested engines',
    async failure => {
      engines = [engine('google'), engine('bing')]
      if (failure === 'http') fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
      if (failure === 'network') fetchMock.mockRejectedValueOnce(new TypeError('network unavailable'))
      if (failure === 'schema') fetchMock.mockResolvedValueOnce(Response.json({ results: [{ title: 'missing URL' }] }))
      fetchMock.mockResolvedValueOnce(response([hit('https://example.org/recovered')]))
      const { search } = await import('./searxng.server')
      expect(await search(QUERY)).toMatchObject({ hits: [], degraded: true, failedEngines: ['google', 'bing'] })
      expect(mocks.recordHealth).toHaveBeenCalledWith(
        [],
        [
          ['google', expect.any(String)],
          ['bing', expect.any(String)],
        ],
      )
      expect((await search(QUERY)).hits).toHaveLength(1)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
  )

  it('coalesces concurrent searches and caches usable partial results', async () => {
    let release!: (response: Response) => void
    fetchMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = resolve
        }),
    )
    const { search } = await import('./searxng.server')
    const first = search(QUERY)
    const second = search(QUERY)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    release(response([{ ...hit('https://nndl.github.io/'), engine: 'bing' }], [['google', 'access denied']]))
    const [a, b] = await Promise.all([first, second])
    expect(a).toBe(b)
    expect(await search(QUERY)).toBe(a)
    expect(a).toMatchObject({ degraded: true, failedEngines: ['google'] })
    expect(a.hits).toHaveLength(1)
    expect(mocks.recordHealth).toHaveBeenCalledWith(['bing'], [['google', 'access denied']])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves successful groups when another language group fails', async () => {
    engines = [engine('duckduckgo'), engine('google')]
    fetchMock
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(response([{ ...hit('https://example.org/'), engine: 'google' }]))
    const { search } = await import('./searxng.server')
    const page = await search(QUERY)
    expect(page).toMatchObject({ degraded: true, failedEngines: ['duckduckgo'] })
    expect(page.hits).toHaveLength(1)
    expect(mocks.recordHealth).toHaveBeenCalledWith(['google'], [['duckduckgo', expect.any(String)]])
  })

  it('does not fall back to upstream defaults or cache an empty search when no engines qualify', async () => {
    engines = [engine('first-page-only', { paging: false })]
    const { search } = await import('./searxng.server')
    expect(await search(QUERY)).toMatchObject({ hits: [], degraded: true, failedEngines: [] })
    expect(fetchMock).not.toHaveBeenCalled()
    engines[0]!.paging = true
    expect(await search(QUERY)).toMatchObject({ degraded: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('invalidates cached searches on settings revision even when the engine request is unchanged', async () => {
    fetchMock.mockImplementation(async () => response([hit('https://example.org/')]))
    const { search } = await import('./searxng.server')
    const first = await search(QUERY)
    expect(first.hits).toHaveLength(1)
    expect(await search(QUERY)).toBe(first)
    snapshot = {
      ...snapshot,
      revision: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
      settings: { ...snapshot.settings, safeSearch: 2, blockedHosts: ['example.org'] },
    }
    const updated = await search(QUERY)
    expect(updated).not.toBe(first)
    expect(updated.hits).toHaveLength(0)
    expect(await search(QUERY)).toBe(updated)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(requests(fetchMock).map(url => url.searchParams.get('safesearch'))).toEqual(['1', '2'])
    expect(mocks.readSettings).toHaveBeenCalledTimes(4)
  })

  it('shares cache entries for equivalent browser preferences but separates resolved languages', async () => {
    const { search } = await import('./searxng.server')
    const query = { ...QUERY, q: 'Rust' }
    const english = await search({ ...query, browserLanguage: 'en-US,en;q=0.8' })
    expect(await search({ ...query, browserLanguage: 'en-GB' })).toBe(english)
    const german = await search({ ...query, browserLanguage: 'de-DE' })
    expect(german).not.toBe(english)
    expect(german.language).toBe('de')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('separates cache entries for page, time, category, and selected engines', async () => {
    engines[0]!.categories.push('images')
    const { search } = await import('./searxng.server')
    await search(QUERY)
    await search({ ...QUERY, page: 1 })
    await search({ ...QUERY, time: 'day' })
    await search({ ...QUERY, tab: 'images' })
    engines.push(engine('bing'))
    await search(QUERY)
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
})

describe('search result normalization', () => {
  it('prefers Chinese results while preserving English technical sources', async () => {
    fetchMock.mockResolvedValueOnce(
      response([
        hit('https://example.org/en'),
        hit('https://nndl.github.io/', '神经网络与深度学习', '邱锡鹏的神经网络与深度学习课程与教材'),
        hit('https://github.com/nndl/nndl'),
      ]),
    )
    const { search } = await import('./searxng.server')
    const page = await search(QUERY)
    expect(page.hits[0]?.url).toBe('https://nndl.github.io/')
    expect(page.hits.map(h => h.host)).toContain('github.com')
  })

  it.each([
    {
      thumbnail: '',
      thumbnail_src: '//cdn.example.org/fallback.jpg',
      img_src: 'https://example.org/full.jpg',
      expected: 'https://cdn.example.org/fallback.jpg',
    },
    {
      thumbnail: 'javascript:alert(1)',
      thumbnail_src: 'https://example.org/fallback.jpg',
      expected: 'https://example.org/fallback.jpg',
    },
    {
      thumbnail: 'https://example.org/primary.jpg',
      thumbnail_src: 'https://example.org/fallback.jpg',
      expected: 'https://example.org/primary.jpg',
    },
    {
      thumbnail: '',
      thumbnail_src: '/relative.jpg',
      img_src: '//example.org/full.jpg',
      expected: 'https://example.org/full.jpg',
    },
    {
      thumbnail: 'data:image/png;base64,AAAA',
      thumbnail_src: 'file:///tmp/image.jpg',
      img_src: '/relative.jpg',
      expected: undefined,
    },
  ])('selects a safe thumbnail from $thumbnail / $thumbnail_src', async ({ expected, ...media }) => {
    fetchMock.mockResolvedValueOnce(response([{ ...hit('https://example.org/'), ...media }]))
    const { search } = await import('./searxng.server')
    expect((await search(QUERY)).hits[0]?.thumbnail).toBe(expected)
  })

  it.each([
    [0, '0:00'],
    [65.9, '1:05'],
    [3599, '59:59'],
    [3661, '1:01:01'],
    [' 12:34 ', '12:34'],
    ['', undefined],
    ['  ', undefined],
    [-1, undefined],
    [null, undefined],
  ])('formats video length %j as %j', async (length, expected) => {
    engines = [engine('youtube', { categories: ['videos'] })]
    fetchMock.mockResolvedValueOnce(
      response([
        {
          ...hit('https://example.org/video'),
          length,
          author: 'Creator',
          source: 'Video source',
          resolution: '1920x1080',
          engine: 'youtube',
        },
      ]),
    )
    const { search } = await import('./searxng.server')
    const page = await search({ ...QUERY, tab: 'videos' })
    expect(page.hits[0]).toMatchObject({
      duration: expected,
      author: 'Creator',
      source: 'Video source',
      resolution: '1920x1080',
      engines: ['youtube'],
    })
    expect(requests(fetchMock)[0]?.searchParams.get('engines')).toBe('youtube')
    expect(requests(fetchMock)[0]?.searchParams.has('categories')).toBe(false)
  })

  it('cleans tracking URLs, discards unsafe links, and tolerates missing title and content', async () => {
    fetchMock.mockResolvedValueOnce(
      response([
        {
          url: 'https://www.example.org/docs/%E4%B8%AD%E6%96%87?utm_source=test&keep=1#section',
          title: null,
          content: null,
        },
        { url: 'https://example.org/long', content: `  ${'word '.repeat(100)} ` },
        { url: 'javascript:alert(1)' },
        { url: 'not a URL' },
      ]),
    )
    const { search } = await import('./searxng.server')
    const page = await search(QUERY)
    expect(page.hits).toHaveLength(2)
    expect(page.hits[0]).toMatchObject({
      url: 'https://www.example.org/docs/%E4%B8%AD%E6%96%87?keep=1',
      host: 'example.org',
      title: 'example.org',
      snippet: '',
      crumbs: 'example.org › docs › 中文',
    })
    expect(page.hits[1]?.snippet).toHaveLength(281)
    expect(page.hits[1]?.snippet.endsWith('…')).toBe(true)
  })

  it('merges grouped responses, deduplicates answers and suggestions, and sanitizes infobox media and links', async () => {
    engines = [engine('duckduckgo'), engine('google')]
    fetchMock
      .mockResolvedValueOnce(
        response([hit('https://example.org/?utm_source=ddg')], [], {
          answers: ['answer', { answer: 'answer' }],
          suggestions: ['one', 'two'],
          corrections: ['corrected'],
          infoboxes: [
            {
              infobox: 'Topic',
              content: 'Summary',
              img_src: 'javascript:alert(1)',
              urls: [
                { title: 'safe', url: 'https://example.org/' },
                { title: 'unsafe', url: 'data:text/html,test' },
              ],
              attributes: [
                { label: 'text', value: 'value' },
                { label: 'number', value: 123 },
                { label: 'empty', value: '' },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response([hit('https://example.org/')], [], {
          answers: [{ answer: 'second' }],
          suggestions: ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'],
        }),
      )
    const { search } = await import('./searxng.server')
    const page = await search(QUERY)
    expect(page.hits).toHaveLength(1)
    expect(page.answers).toEqual(['answer', 'second'])
    expect(page.suggestions).toEqual(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'])
    expect(page.correction).toBe('corrected')
    expect(page.infobox).toEqual({
      title: 'Topic',
      content: 'Summary',
      image: undefined,
      links: [{ title: 'safe', url: 'https://example.org/' }],
      attributes: [{ label: 'text', value: 'value' }],
    })
  })
})
