import { z } from 'zod'
import { BLOCKED_HOSTS, DEMOTED_HOSTS, TRUSTED_HOSTS } from './result-policy'

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/, 'invalidDomain')

const optionalUrl = z.union([z.literal(''), z.url().max(300)])
const clamp = (min: number, max: number, fallback: number) => z.number().min(min).max(max).default(fallback)

/** Empty endpoint fields fall back to the server environment. */
export const aiSchema = z.object({
  baseUrl: optionalUrl.default(''),
  model: z.string().trim().max(120).default(''),
  temperature: clamp(0, 1, 0.2),
  maxWords: z.number().int().min(30).max(600).default(150),
  sourceCount: z.number().int().min(2).max(10).default(6),
  timeoutSec: z.number().int().min(10).max(180).default(60),
  instructions: z.string().trim().max(1000).default(''),
})

export const jevSchema = z.object({
  enabled: z.boolean().default(true),
  baseUrl: optionalUrl.default(''),
  model: z.string().trim().max(120).default(''),
  timeoutMs: z.number().int().min(300).max(10_000).default(2000),
  minConfidence: clamp(0.5, 0.99, 0.65),
  minTop: clamp(0.5, 0.99, 0.75),
  minMargin: clamp(0, 0.9, 0.25),
  cacheMinutes: z.number().int().min(0).max(1440).default(60),
})

export const usageSchema = z.object({
  enabled: z.boolean().default(true),
  /** Off keeps counts, timings and tokens but stores no query text. */
  recordQueries: z.boolean().default(true),
  retentionDays: z.number().int().min(1).max(3650).default(90),
})

/** Operational limits. Rate limits are per client IP per minute. */
export const limitsSchema = z.object({
  cacheMinutes: z.number().int().min(0).max(120).default(5),
  upstreamTimeoutSec: z.number().int().min(2).max(60).default(10),
  searchPerMinute: z.number().int().min(1).max(1000).default(90),
  suggestPerMinute: z.number().int().min(1).max(2000).default(240),
  intentPerMinute: z.number().int().min(1).max(1000).default(90),
  summaryPerMinute: z.number().int().min(1).max(200).default(12),
  livePerMinute: z.number().int().min(1).max(1000).default(60),
})

/** Live cards use Open-Meteo: free, keyless; receives only the place name and coordinates. */
export const liveSchema = z.object({
  weather: z.boolean().default(true),
  time: z.boolean().default(true),
  /** auto: Fahrenheit for US English browsers, Celsius otherwise. */
  temperatureUnit: z.enum(['auto', 'celsius', 'fahrenheit']).default('auto'),
  cacheMinutes: z.number().int().min(1).max(180).default(10),
})

export const settingsSchema = z.object({
  engines: z
    .record(
      z.string().min(1).max(100),
      z.object({
        enabled: z.boolean(),
        weight: z.number().min(0.1).max(5),
      }),
    )
    .default({}),
  safeSearch: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(1),
  defaultLanguage: z.string().min(1).max(30).default('auto'),
  aiEnabled: z.boolean().default(true),
  aiAuto: z.boolean().default(true),
  ai: aiSchema.prefault({}),
  jev: jevSchema.prefault({}),
  usage: usageSchema.prefault({}),
  limits: limitsSchema.prefault({}),
  live: liveSchema.prefault({}),
  blockedHosts: z
    .array(domain)
    .max(1000)
    .default([...BLOCKED_HOSTS]),
  demotedHosts: z
    .array(domain)
    .max(1000)
    .default([...DEMOTED_HOSTS]),
  trustedHosts: z
    .array(domain)
    .max(1000)
    .default([...TRUSTED_HOSTS]),
})

export type Settings = z.infer<typeof settingsSchema>
export type AiSettings = z.infer<typeof aiSchema>
export type JevSettings = z.infer<typeof jevSchema>
export const defaultSettings = (): Settings => settingsSchema.parse({})
export interface LanguageOption {
  code: string
  name: string
}
export interface PublicContext {
  locale: string
  languages: LanguageOption[]
  aiEnabled: boolean
  aiAuto: boolean
}
export interface EngineInfo {
  name: string
  categories: string[]
  enabled: boolean
  paging: boolean
  languageSupport: boolean
  timeRangeSupport: boolean
}
export interface EngineHealth {
  checkedAt: string
  lastSuccessAt?: string
  lastFailureAt?: string
  error?: string
}
export interface SettingsSnapshot {
  revision: number
  updatedAt: string | null
  settings: Settings
}
export type SecretName = 'ai' | 'jev'
export interface SecretStatus {
  source: 'admin' | 'env' | 'none'
  /** Last four characters only; the key itself never leaves the server. */
  last4?: string
  /** The intent service is using the AI provider's key. */
  inherited?: boolean
  /** Stored value cannot be decrypted, e.g. ADMIN_PASSWORD changed. */
  unreadable?: boolean
}
/** Effective endpoint after settings and environment are merged. */
export interface EndpointInfo {
  baseUrl: string
  model: string
  secret: SecretStatus
}
export interface ConnectionTest {
  ok: boolean
  ms: number
  detail: string
}
export interface AdminData extends SettingsSnapshot {
  engines: EngineInfo[]
  languages: LanguageOption[]
  health: Record<string, EngineHealth>
  models: Record<SecretName, EndpointInfo>
}

export type UsageDetail = Record<string, string | number | boolean | null | ReadonlyArray<string>>
export type UsageKind = 'search' | 'suggest' | 'intent' | 'summary' | 'live'
export interface UsageEvent {
  id: number
  ts: number
  kind: UsageKind
  query: string | null
  tab: string | null
  page: number | null
  lang: string | null
  ms: number
  ok: boolean
  cached: boolean | null
  results: number | null
  error: string | null
  model: string | null
  tokensIn: number | null
  tokensOut: number | null
  detail: UsageDetail | null
}
export interface KindStats {
  kind: UsageKind
  count: number
  errors: number
  cached: number
  p50: number
  p95: number
  tokensIn: number
  tokensOut: number
}
export interface EngineStats {
  engine: string
  calls: number
  failures: number
  results: number
  lastError: string | null
}
export interface UsageReport {
  since: number
  bucketMs: number
  kinds: KindStats[]
  series: Array<{ ts: number; search: number; summary: number; errors: number }>
  topQueries: Array<{ query: string; count: number }>
  zeroResultQueries: Array<{ query: string; count: number }>
  engines: EngineStats[]
  intents: Array<{ intent: string; count: number }>
}

export interface SearxngStatus {
  url: string
  ok: boolean
  ms: number
  error?: string
  version?: string
  instance?: string
  engines?: number
  enabledEngines?: number
  plugins?: string[]
  safeSearch?: number
}
export interface HistoryEntry {
  revision: number
  at: string
  changes: string[]
}
export interface SystemInfo {
  searxng: SearxngStatus
  usage: { events: number; oldest: number | null }
  history: HistoryEntry[]
  node: string
  uptimeSec: number
  dataDir: string
}
