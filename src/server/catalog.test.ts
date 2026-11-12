import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings, type EngineInfo } from '~/lib/settings'
import type { Tab } from '~/lib/types'

vi.mock('./env.server', () => ({ env: () => ({ SEARXNG_URL: 'http://searx.test:8888' }) }))
const rawEngine = (name: string, overrides: object = {}) => ({
  name,
  categories: ['general'],
  enabled: true,
  ...overrides,
})
const engine = (name: string, overrides: Partial<EngineInfo> = {}): EngineInfo => ({
  name,
  categories: ['general'],
  enabled: true,
  paging: true,
  languageSupport: true,
  timeRangeSupport: true,
  ...overrides,
})
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.useRealTimers())

describe('catalog discovery', () => {
  it('maps capabilities and canonicalizes advertised languages while ignoring sentinels', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        engines: [
          rawEngine('google', {
            paging: true,
            language_support: true,
            time_range_support: true,
            languages: ['en-US', 'zh_Hans_CN', 'fil', 'all', 'auto', 'clear', 'english'],
            regions: ['de_DE', 'zh_TW', 'en_US', 'bad_tag_!'],
          }),
          rawEngine('images', { categories: ['images'], enabled: false }),
        ],
        locales: {
          en: 'English',
          en_US: 'English (US)',
          ja: 'Japanese',
          all: 'All',
          auto: 'Automatic',
          clear: 'Clear',
        },
      }),
    )
    const { getCatalog } = await import('./catalog.server')
    const catalog = await getCatalog()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(String(fetchMock.mock.calls[0]![0]))
    expect(url.href).toBe('http://searx.test:8888/config')
    expect(catalog.engines).toEqual([
      engine('google'),
      engine('images', {
        categories: ['images'],
        enabled: false,
        paging: false,
        languageSupport: false,
        timeRangeSupport: false,
      }),
    ])
    expect(catalog.languages.map(language => language.code).sort()).toEqual(
      ['en', 'en-US', 'zh-Hans-CN', 'fil', 'de-DE', 'zh-TW', 'ja'].sort(),
    )
    expect(catalog.languages.every(language => Boolean(language.name))).toBe(true)
    expect(catalog.languages.map(language => language.name)).toEqual(
      catalog.languages.map(language => language.name).sort((a, b) => a.localeCompare(b)),
    )
  })

  it('coalesces requests, caches for thirty seconds, then discovers updated engines', async () => {
    let release!: (value: Response) => void
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            release = resolve
          }),
      )
      .mockResolvedValueOnce(Response.json({ engines: [rawEngine('bing')], locales: {} }))
    const { getCatalog } = await import('./catalog.server')
    const first = getCatalog()
    expect(getCatalog()).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    release(Response.json({ engines: [rawEngine('google')], locales: {} }))
    const initial = await first
    vi.setSystemTime(Date.now() + 29_999)
    expect(await getCatalog()).toBe(initial)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 1)
    expect((await getCatalog()).engines.map(engine => engine.name)).toEqual(['bing'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each(['http', 'network', 'schema'] as const)('does not cache %s failures', async failure => {
    if (failure === 'http') fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('offline'))
    if (failure === 'schema')
      fetchMock.mockResolvedValueOnce(Response.json({ engines: [{ name: 'missing capabilities' }], locales: {} }))
    fetchMock.mockResolvedValueOnce(Response.json({ engines: [], locales: {} }))
    const { getCatalog } = await import('./catalog.server')
    await expect(getCatalog()).rejects.toThrow()
    expect(await getCatalog()).toEqual({ engines: [], languages: [] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('catalog engine selection', () => {
  it.each([
    ['all', 'general'],
    ['images', 'images'],
    ['videos', 'videos'],
    ['news', 'news'],
    ['science', 'science'],
    ['it', 'it'],
  ] satisfies [Tab, string][])('selects only engines serving the %s tab', async (tab, category) => {
    const { selectedEngines } = await import('./catalog.server')
    const target = engine('target', { categories: [category, 'other'] })
    expect(
      selectedEngines([engine('unrelated', { categories: ['other'] }), target], defaultSettings(), tab, 1, 'any'),
    ).toEqual([target])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lets explicit enabled settings override upstream defaults in both directions', async () => {
    const { selectedEngines } = await import('./catalog.server')
    const engines = [
      engine('default-on'),
      engine('default-off', { enabled: false }),
      engine('force-off'),
      engine('force-on', { enabled: false }),
    ]
    const settings = defaultSettings()
    settings.engines = { 'force-off': { enabled: false, weight: 5 }, 'force-on': { enabled: true, weight: 0.1 } }
    expect(selectedEngines(engines, settings, 'all', 1, 'any').map(engine => engine.name)).toEqual([
      'default-on',
      'force-on',
    ])
  })

  it.each([
    [1, 'any', ['full', 'first-page', 'no-time', 'neither']],
    [2, 'any', ['full', 'no-time']],
    [1, 'day', ['full', 'first-page']],
    [3, 'week', ['full']],
  ] as const)('respects paging and time capabilities on page %i with time %s', async (page, time, expected) => {
    const { selectedEngines } = await import('./catalog.server')
    const engines = [
      engine('full'),
      engine('first-page', { paging: false }),
      engine('no-time', { timeRangeSupport: false }),
      engine('neither', { paging: false, timeRangeSupport: false }),
    ]
    expect(selectedEngines(engines, defaultSettings(), 'all', page, time).map(engine => engine.name)).toEqual(expected)
  })
})

describe('observed engine health', () => {
  it('starts empty and records only observed outcomes, clearing errors after recovery', async () => {
    const { getEngineHealth, recordHealth } = await import('./catalog.server')
    expect(getEngineHealth()).toEqual({})
    const failedAt = new Date().toISOString()
    recordHealth(['google', 'google'], [['bing', 'timeout']])
    expect(getEngineHealth()).toEqual({
      google: { checkedAt: failedAt, lastSuccessAt: failedAt, error: undefined },
      bing: { checkedAt: failedAt, lastFailureAt: failedAt, error: 'timeout' },
    })
    vi.setSystemTime(Date.now() + 1000)
    const recoveredAt = new Date().toISOString()
    recordHealth(['bing'], [])
    expect(getEngineHealth().bing).toEqual({
      checkedAt: recoveredAt,
      lastSuccessAt: recoveredAt,
      lastFailureAt: failedAt,
      error: undefined,
    })
    recordHealth([], [['google', 'access denied']])
    expect(getEngineHealth().google).toEqual({
      checkedAt: recoveredAt,
      lastSuccessAt: failedAt,
      lastFailureAt: recoveredAt,
      error: 'access denied',
    })
  })
})
