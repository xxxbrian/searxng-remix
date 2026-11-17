import { z } from 'zod'
import { type LiveCard, type LiveKind, type Place, timePlace, type WeatherCardData, weatherPlaces } from '~/lib/live'
import type { Settings } from '~/lib/settings'
import { TtlCache, TtlCachePool } from './cache.server'
import { recordUsage } from './usage.server'

/**
 * Open-Meteo (forecasts, geocoding) and OpenStreetMap Nominatim (geocoding
 * fallback): free and keyless. Only the extracted place name and coordinates
 * leave the server, never the full query or the visitor's address.
 */
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const TIMEOUT_MS = 6000
const ATTEMPTS = 2
/** Nominatim's usage policy: identify the application, at most one request per second. */
const USER_AGENT = 'remix-search/1.0 (self-hosted SearXNG front end)'
const NOMINATIM_SPACING_MS = 1100

const geocodeSchema = z.object({
  results: z
    .array(
      z.looseObject({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        timezone: z.string(),
        feature_code: z.string().optional(),
        country_code: z.string().optional(),
        country: z.string().optional(),
        admin1: z.string().optional(),
        population: z.number().optional(),
      }),
    )
    .default([]),
})
type GeoResult = z.infer<typeof geocodeSchema>['results'][number]

const nominatimSchema = z.array(
  z.looseObject({
    lat: z.string(),
    lon: z.string(),
    name: z.string().default(''),
    addresstype: z.string().default(''),
    importance: z.number().default(0),
    address: z
      .looseObject({
        country: z.string().optional(),
        country_code: z.string().optional(),
        state: z.string().optional(),
        province: z.string().optional(),
      })
      .default({}),
  }),
)
const timezoneSchema = z.object({ timezone: z.string() })

const series = z.array(z.number().nullable())
const forecastSchema = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    relative_humidity_2m: z.number(),
    wind_speed_10m: z.number(),
    precipitation: z.number(),
    weather_code: z.number(),
    is_day: z.number(),
  }),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: series,
    temperature_2m_max: series,
    temperature_2m_min: series,
    precipitation_probability_max: series,
  }),
})

const geocodeCache = new TtlCache<Place | null>(7 * 86_400_000, 2000)
const forecastCaches = new TtlCachePool<WeatherCardData>(500)

/** A clock needs a real city or country; "Rust time" must not become a village in Austria. */
const prominent = (result: GeoResult) =>
  /^(PCL|PPLC|PPLA)/.test(result.feature_code ?? '') || (result.population ?? 0) >= 50_000

function toPlace(result: GeoResult): Place {
  return {
    name: result.name,
    region: result.admin1 && result.admin1 !== result.name ? result.admin1 : undefined,
    country: result.country,
    countryCode: result.country_code,
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone,
  }
}

/**
 * The upstreams are far from many servers (a fresh TLS connection can take a
 * second), so a slow moment is retried once before the card gives up.
 */
async function fetchJson(url: URL, headers?: Record<string, string>): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (error) {
      const transient = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'TypeError')
      if (!transient || attempt >= ATTEMPTS) throw error
    }
  }
}

async function openMeteoPlace(name: string, language: string, strict: boolean): Promise<Place | null> {
  const url = new URL(GEOCODE_URL)
  url.search = new URLSearchParams({ name, count: '5', language: language.split('-')[0]!, format: 'json' }).toString()
  const { results } = geocodeSchema.parse(await fetchJson(url))
  const match = strict ? results.find(prominent) : results[0]
  return match ? toPlace(match) : null
}

let nominatimTurn: Promise<unknown> = Promise.resolve()
/** Serialises calls process-wide so they stay at least a second apart. */
function nominatimSlot<T>(work: () => Promise<T>): Promise<T> {
  const job = nominatimTurn.then(work)
  nominatimTurn = job
    .catch(() => undefined)
    .then(() => new Promise(resolve => setTimeout(resolve, NOMINATIM_SPACING_MS)))
  return job
}

/** Nominatim has no time zones; Open-Meteo resolves one from the coordinates. */
async function timezoneAt(latitude: number, longitude: number): Promise<string> {
  const url = new URL(FORECAST_URL)
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    timezone: 'auto',
    current: 'is_day',
  }).toString()
  return timezoneSchema.parse(await fetchJson(url)).timezone
}

const firstName = (value?: string) => value?.split(/[;/]/)[0]?.trim() || undefined

async function nominatimPlace(name: string, language: string, strict: boolean): Promise<Place | null> {
  const url = new URL(NOMINATIM_URL)
  url.search = new URLSearchParams({
    q: name,
    format: 'jsonv2',
    limit: '3',
    addressdetails: '1',
    'accept-language': language,
  }).toString()
  const results = nominatimSchema.parse(await nominatimSlot(() => fetchJson(url, { 'user-agent': USER_AGENT })))
  // Importance is OSM's prominence score: capitals and large cities rank well above 0.5.
  const match = strict ? results.find(r => r.importance >= 0.5) : results[0]
  if (!match) return null
  const latitude = Number(match.lat)
  const longitude = Number(match.lon)
  return {
    name: firstName(match.name) ?? name,
    region: firstName(match.address.state ?? match.address.province),
    country: firstName(match.address.country),
    countryCode: match.address.country_code?.toUpperCase(),
    latitude,
    longitude,
    timezone: await timezoneAt(latitude, longitude),
  }
}

const isCjk = (text: string) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)

/**
 * Open-Meteo's index is GeoNames, which knows few CJK names of foreign places
 * (东京 finds a village in China). CJK names go to Nominatim; Latin names try
 * Open-Meteo first and fall back to Nominatim.
 */
export function geocode(name: string, language: string, strict: boolean): Promise<Place | null> {
  return geocodeCache.get(JSON.stringify([name, language, strict]), async () => {
    const cjk = isCjk(name)
    const place = (!cjk && (await openMeteoPlace(name, 'en', strict))) || (await nominatimPlace(name, language, strict))
    // Show a CJK place exactly as the visitor wrote it: no 倫敦 for 伦敦, no 东京都/東京都.
    return place && cjk ? { ...place, name } : place
  })
}

async function forecast(place: Place, unit: 'C' | 'F', cacheMinutes: number): Promise<WeatherCardData> {
  // Rounded coordinates let nearby lookups share one upstream request.
  const key = JSON.stringify([place.latitude.toFixed(2), place.longitude.toFixed(2), unit])
  const card = await forecastCaches.forMinutes(cacheMinutes).get(key, async () => {
    const url = new URL(FORECAST_URL)
    url.search = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      timezone: place.timezone,
      forecast_days: '7',
      current:
        'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      ...(unit === 'F' && { temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch' }),
    }).toString()
    const { current, daily } = forecastSchema.parse(await fetchJson(url))
    return {
      kind: 'weather',
      place,
      temperatureUnit: unit,
      windUnit: unit === 'F' ? 'mph' : 'km/h',
      observedAt: current.time,
      current: {
        temperature: current.temperature_2m,
        apparent: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        wind: current.wind_speed_10m,
        precipitation: current.precipitation,
        code: current.weather_code,
        isDay: current.is_day === 1,
      },
      daily: daily.time.flatMap((date, i) => {
        const [code, max, min] = [daily.weather_code[i], daily.temperature_2m_max[i], daily.temperature_2m_min[i]]
        return code == null || max == null || min == null
          ? []
          : [{ date, code, max, min, precipitationChance: daily.precipitation_probability_max[i] ?? null }]
      }),
    } satisfies WeatherCardData
  })
  // Cached by coordinates: present it under the name this visitor searched for.
  return { ...card, place }
}

export function temperatureUnit(setting: Settings['live']['temperatureUnit'], acceptLanguage: string): 'C' | 'F' {
  if (setting !== 'auto') return setting === 'fahrenheit' ? 'F' : 'C'
  const first = acceptLanguage.split(',')[0]?.trim().toLowerCase() ?? ''
  return first === 'en-us' ? 'F' : 'C'
}

/** Null when the feature is off or the place cannot be resolved. Never throws. */
export async function liveCard(
  query: string,
  kind: LiveKind,
  settings: Settings,
  language: string,
  acceptLanguage: string,
): Promise<LiveCard | null> {
  // Places are derived here from the query, never taken from the client.
  const places = kind === 'weather' ? weatherPlaces(query) : [timePlace(query)].filter(p => p !== undefined)
  if (!settings.live[kind] || !places.length) return null
  const started = performance.now()
  let place: Place | null = null
  try {
    for (const name of places) {
      place = await geocode(name, language, kind === 'time')
      if (place) break
    }
    const card: LiveCard | null = !place
      ? null
      : kind === 'time'
        ? { kind: 'time', place }
        : await forecast(
            place,
            temperatureUnit(settings.live.temperatureUnit, acceptLanguage),
            settings.live.cacheMinutes,
          )
    void recordUsage({
      kind: 'live',
      query,
      ms: performance.now() - started,
      ok: true,
      results: card ? 1 : 0,
      detail: { card: kind, place: place?.name ?? null },
    })
    return card
  } catch (error) {
    void recordUsage({
      kind: 'live',
      query,
      ms: performance.now() - started,
      ok: false,
      error:
        error instanceof Error && error.name === 'TimeoutError'
          ? 'timeout'
          : error instanceof Error
            ? error.message
            : String(error),
      detail: { card: kind },
    })
    return null
  }
}
