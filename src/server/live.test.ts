import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '~/lib/settings'

const mocks = vi.hoisted(() => ({ usage: [] as unknown[] }))
vi.mock('./usage.server', () => ({
  recordUsage: async (event: unknown) => {
    mocks.usage.push(event)
  },
}))

const geo = (results: unknown[]) => Response.json({ results })
const london = {
  name: 'London',
  latitude: 51.5,
  longitude: -0.12,
  timezone: 'Europe/London',
  country_code: 'GB',
  country: 'United Kingdom',
  admin1: 'England',
  feature_code: 'PPLC',
  population: 8_900_000,
}
const forecast = {
  current: {
    time: '2026-11-15T13:45',
    temperature_2m: 10.4,
    apparent_temperature: 8.2,
    relative_humidity_2m: 87,
    wind_speed_10m: 12.1,
    precipitation: 0.2,
    weather_code: 61,
    is_day: 1,
  },
  daily: {
    time: ['2026-11-15', '2026-11-16'],
    weather_code: [61, null],
    temperature_2m_max: [12, 11],
    temperature_2m_min: [7, 6],
    precipitation_probability_max: [80, null],
  },
}

let request: ReturnType<typeof vi.fn<typeof fetch>>
beforeEach(() => {
  vi.resetModules()
  mocks.usage = []
  request = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', request)
})

describe('live cards', () => {
  it('geocodes the extracted place, fetches the forecast and caches both', async () => {
    request.mockImplementation(async input =>
      String(input).includes('geocoding') ? geo([london]) : Response.json(forecast),
    )
    const { liveCard } = await import('./live.server')
    const card = await liveCard('London weather', 'weather', defaultSettings(), 'en', 'en-GB')
    expect(card).toMatchObject({
      kind: 'weather',
      temperatureUnit: 'C',
      windUnit: 'km/h',
      observedAt: '2026-11-15T13:45',
      place: { name: 'London', region: 'England', country: 'United Kingdom', timezone: 'Europe/London' },
      current: { temperature: 10.4, code: 61, isDay: true },
    })
    // A day with a missing value is dropped rather than shown as zero.
    expect(card?.kind === 'weather' && card.daily).toEqual([
      { date: '2026-11-15', code: 61, max: 12, min: 7, precipitationChance: 80 },
    ])
    const geocodeUrl = new URL(String(request.mock.calls[0]![0]))
    expect(geocodeUrl.searchParams.get('name')).toBe('london')
    // The forecast request carries coordinates only, never the search text.
    expect([...new URL(String(request.mock.calls[1]![0])).searchParams.keys()]).not.toContain('name')
    await liveCard('weather in london', 'weather', defaultSettings(), 'en', 'en-GB')
    expect(request).toHaveBeenCalledTimes(2)
    expect(mocks.usage).toHaveLength(2)
  })

  it('uses Fahrenheit for US English when the unit is automatic', async () => {
    request.mockImplementation(async input =>
      String(input).includes('geocoding') ? geo([london]) : Response.json(forecast),
    )
    const { liveCard } = await import('./live.server')
    expect(await liveCard('London weather', 'weather', defaultSettings(), 'en', 'en-US,en;q=0.9')).toMatchObject({
      temperatureUnit: 'F',
      windUnit: 'mph',
    })
    expect(new URL(String(request.mock.calls[1]![0])).searchParams.get('temperature_unit')).toBe('fahrenheit')
  })

  it('requires a prominent place for clocks', async () => {
    request.mockImplementation(async input =>
      String(input).includes('nominatim')
        ? Response.json([{ lat: '47.8', lon: '16.7', name: 'Rust', addresstype: 'town', importance: 0.3, address: {} }])
        : geo([{ ...london, name: 'Rust', feature_code: 'PPL', population: 1900 }]),
    )
    const { liveCard } = await import('./live.server')
    expect(await liveCard('Rust time', 'time', defaultSettings(), 'en', 'en')).toBeNull()
    expect(request.mock.calls.map(([url]) => new URL(String(url)).hostname)).toEqual([
      'geocoding-api.open-meteo.com',
      'nominatim.openstreetmap.org',
    ])
    request.mockReset()
    request.mockResolvedValue(geo([{ ...london, name: 'Tokyo', timezone: 'Asia/Tokyo' }]))
    expect(await liveCard('Tokyo time', 'time', defaultSettings(), 'en', 'en')).toMatchObject({
      kind: 'time',
      place: { timezone: 'Asia/Tokyo' },
    })
  })

  it('geocodes CJK names with Nominatim and keeps the name as written', async () => {
    request.mockImplementation(async input => {
      const url = new URL(String(input))
      if (url.hostname.startsWith('nominatim')) {
        return Response.json([
          {
            lat: '35.68',
            lon: '139.69',
            name: '东京都/東京都',
            addresstype: 'province',
            importance: 0.83,
            address: { country: '日本', country_code: 'jp' },
          },
        ])
      }
      return Response.json({ timezone: 'Asia/Tokyo' })
    })
    const { liveCard } = await import('./live.server')
    const card = await liveCard('东京时间', 'time', defaultSettings(), 'zh-CN', 'zh-CN')
    expect(card).toEqual({
      kind: 'time',
      place: {
        name: '东京',
        country: '日本',
        countryCode: 'JP',
        latitude: 35.68,
        longitude: 139.69,
        timezone: 'Asia/Tokyo',
        region: undefined,
      },
    })
    const [nominatim, timezone] = request.mock.calls.map(([url]) => new URL(String(url)))
    expect(nominatim!.searchParams.get('q')).toBe('东京')
    expect(nominatim!.searchParams.get('accept-language')).toBe('zh-CN')
    expect(request.mock.calls[0]![1]!.headers).toMatchObject({ 'user-agent': expect.stringContaining('remix') })
    expect(timezone!.searchParams.get('timezone')).toBe('auto')
  })

  it('returns null without a request when disabled, and on upstream failure', async () => {
    const { liveCard } = await import('./live.server')
    const settings = defaultSettings()
    settings.live.weather = false
    expect(await liveCard('London weather', 'weather', settings, 'en', 'en')).toBeNull()
    expect(request).not.toHaveBeenCalled()
    request.mockResolvedValue(new Response(null, { status: 503 }))
    expect(await liveCard('上海天气', 'weather', defaultSettings(), 'zh-CN', 'zh-CN')).toBeNull()
    expect(mocks.usage.at(-1)).toMatchObject({ kind: 'live', ok: false })
  })

  it('retries once after a timeout, then reports the timeout as a code', async () => {
    const timeout = () => new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    let slow = true
    request.mockImplementation(async input => {
      if (slow) {
        slow = false
        throw timeout()
      }
      return String(input).includes('geocoding') ? geo([london]) : Response.json(forecast)
    })
    const { liveCard } = await import('./live.server')
    expect(await liveCard('London weather', 'weather', defaultSettings(), 'en', 'en-GB')).toMatchObject({
      kind: 'weather',
    })
    expect(request).toHaveBeenCalledTimes(3)

    request.mockReset()
    request.mockRejectedValue(timeout())
    expect(await liveCard('Paris weather', 'weather', defaultSettings(), 'en', 'en-GB')).toBeNull()
    expect(request).toHaveBeenCalledTimes(2)
    expect(mocks.usage.at(-1)).toMatchObject({ kind: 'live', ok: false, error: 'timeout' })
  })

  it('does not retry an HTTP error', async () => {
    request.mockResolvedValue(new Response(null, { status: 503 }))
    const { liveCard } = await import('./live.server')
    await liveCard('Berlin weather', 'weather', defaultSettings(), 'en', 'en')
    expect(request).toHaveBeenCalledTimes(1)
  })
})
