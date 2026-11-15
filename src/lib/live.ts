import type { SearchDecision } from './search-decision'

/**
 * Live cards answer questions whose truth changes by the minute. Their data
 * comes from structured sources, never from search snippets or the AI.
 */
export type LiveKind = 'weather' | 'time'

export interface Place {
  name: string
  region?: string
  country?: string
  countryCode?: string
  latitude: number
  longitude: number
  timezone: string
}

export interface WeatherDay {
  date: string
  code: number
  max: number
  min: number
  precipitationChance: number | null
}

export interface WeatherCardData {
  kind: 'weather'
  place: Place
  temperatureUnit: 'C' | 'F'
  windUnit: 'km/h' | 'mph'
  /** Local time of the observation at the place, ISO without offset. */
  observedAt: string
  current: {
    temperature: number
    apparent: number
    humidity: number
    wind: number
    precipitation: number
    code: number
    isDay: boolean
  }
  daily: WeatherDay[]
}

export interface TimeCardData {
  kind: 'time'
  place: Place
}

export type LiveCard = WeatherCardData | TimeCardData

const WEATHER_WORDS = [
  // CJK has no word boundaries: plain substrings.
  '天气预报',
  '天氣預報',
  '天气',
  '天氣',
  '气温',
  '氣溫',
  '预报',
  '預報',
  '天気予報',
  '天気',
  '気温',
  'weather forecast',
  'weather',
  'forecast',
  'temperature',
  'wettervorhersage',
  'wetter',
  'météo',
  'meteo',
  'prévisions',
  'pronóstico',
  'clima',
]
const WEATHER_FILLER = [
  '未来一周',
  '未来7天',
  '未来七天',
  '这周',
  '本周',
  '一周',
  '今天',
  '明天',
  '后天',
  '今日',
  '明日',
  '現在',
  '现在',
  '怎么样',
  '怎麼樣',
  '如何',
  '多少度',
  '会下雨吗',
  '會下雨嗎',
  '下雨',
  '的',
  'の',
  'は',
  "what's",
  'what',
  'is',
  'the',
  'in',
  'at',
  'for',
  'today',
  'tomorrow',
  'now',
  'this',
  'week',
  'current',
  'like',
  'will',
  'it',
  'rain',
  'heute',
  'morgen',
  'jetzt',
  'aktuell',
  'à',
  'a',
  'en',
  'de',
  'el',
  "aujourd'hui",
  'demain',
  'hoy',
  'mañana',
  'du',
  'tiempo',
  'y',
  'and',
  'und',
  'et',
]
const TIME_PATTERNS = [
  /^(?:current |local )?time (?:in|at) (.+)$/i,
  /^(.+?) (?:local )?time(?: now)?$/i,
  /^(?:what time is it|what's the time) in (.+)$/i,
  /^(.+?)(?:现在)?(?:几点了?|幾點了?|时间|時間|的时间|的時間|当地时间|當地時間)$/,
  /^(.+?)の(?:現在)?時刻$/,
  /^(?:uhrzeit|zeit) in (.+)$/i,
  /^(?:heure|l'heure) (?:à|a|en) (.+)$/i,
  /^(?:hora|la hora) en (.+)$/i,
]

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const normalize = (query: string) =>
  query
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[?？!！。,，]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const isCjk = (word: string) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word)

function strip(text: string, words: readonly string[]): string {
  let rest = ` ${text} `
  for (const word of [...words].sort((a, b) => b.length - a.length)) {
    rest = isCjk(word)
      ? rest.replaceAll(word, ' ')
      : rest.replace(new RegExp(`(?<=[\\s'’])${escapeRegExp(word)}(?=[\\s'’])`, 'giu'), ' ')
  }
  return rest
    .replace(/['’]s\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function hasWeatherWord(query: string): boolean {
  const text = ` ${normalize(query)} `
  return WEATHER_WORDS.some(word =>
    isCjk(word) ? text.includes(word) : new RegExp(`\\s${escapeRegExp(word)}\\s`, 'iu').test(text),
  )
}

const usable = (place: string) => place.length >= 2 && place.length <= 60

/**
 * Place names a weather query may be about, most likely first. Filler words
 * such as "de" are also parts of names ("Santa Cruz de Tenerife"), so the
 * lightly stripped text is kept as a second candidate.
 */
export function weatherPlaces(query: string): string[] {
  const text = normalize(query)
  if (!hasWeatherWord(text)) return []
  const light = strip(text, WEATHER_WORDS)
  const place = strip(light, WEATHER_FILLER)
  return usable(place) ? [...new Set([place, light])] : []
}

/** Only an explicit "time in <place>" phrasing: "time" alone is far too ambiguous. */
export function timePlace(query: string): string | undefined {
  const text = normalize(query)
  for (const pattern of TIME_PATTERNS) {
    const place = pattern.exec(text)?.[1]?.trim()
    if (place && usable(place)) return place
  }
  return undefined
}

/**
 * Jev decides when it is available; without it only unambiguous phrasing
 * qualifies. A navigation decision never shows a live card.
 */
export interface LiveRequest {
  kind: LiveKind
  places: string[]
}

export function liveRequest(query: string, decision: SearchDecision): LiveRequest | undefined {
  if (decision.source === 'jev' && !['weather', 'live', 'fact'].includes(decision.intent)) return undefined
  const weather = weatherPlaces(query)
  if (weather.length) return { kind: 'weather', places: weather }
  const time = timePlace(query)
  return time ? { kind: 'time', places: [time] } : undefined
}

/** WMO weather interpretation codes, grouped to what a person needs to read. */
export type WeatherCondition =
  | 'clear'
  | 'mainlyClear'
  | 'partlyCloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunder'
export function weatherCondition(code: number): WeatherCondition {
  if (code === 0) return 'clear'
  if (code === 1) return 'mainlyClear'
  if (code === 2) return 'partlyCloudy'
  if (code === 3) return 'overcast'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'thunder'
  return 'overcast'
}
