import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type { EngineStats, KindStats, UsageDetail, UsageEvent, UsageKind, UsageReport } from '~/lib/settings'
import { env } from './env.server'
import { readSettings } from './settings.server'

/**
 * Local usage log. Raw events with retention instead of pre-aggregation: a
 * single instance produces little data, and raw rows answer any later question.
 * Response bodies are never stored.
 */
export interface UsageInput {
  kind: UsageKind
  query?: string
  tab?: string
  page?: number
  lang?: string
  ms: number
  ok: boolean
  cached?: boolean
  results?: number
  error?: string
  model?: string
  tokensIn?: number
  tokensOut?: number
  detail?: Record<string, UsageDetail[string] | undefined>
}

const KINDS: readonly UsageKind[] = ['search', 'suggest', 'intent', 'summary', 'live']
let database: DatabaseSync | undefined
let openedFor = ''
let lastPrune = 0

function db(): DatabaseSync {
  const dir = env().DATA_DIR
  if (database && openedFor === dir) return database
  database?.close()
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  database = new DatabaseSync(join(dir, 'usage.sqlite'))
  openedFor = dir
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, kind TEXT NOT NULL, query TEXT, tab TEXT, page INTEGER, lang TEXT,
      ms INTEGER NOT NULL, ok INTEGER NOT NULL, cached INTEGER, results INTEGER, error TEXT, model TEXT,
      tokens_in INTEGER, tokens_out INTEGER, detail TEXT
    );
    CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
    CREATE INDEX IF NOT EXISTS events_kind_ts ON events (kind, ts);
    CREATE TABLE IF NOT EXISTS engine_calls (
      id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, engine TEXT NOT NULL, ok INTEGER NOT NULL, results INTEGER NOT NULL, error TEXT
    );
    CREATE INDEX IF NOT EXISTS engine_calls_ts ON engine_calls (ts);
  `)
  return database
}

const clip = (value: string | undefined, max: number) => (value === undefined ? null : value.slice(0, max))

/** Best effort: telemetry must never break a search. */
export async function recordUsage(event: UsageInput): Promise<void> {
  try {
    const { settings } = await readSettings()
    if (!settings.usage.enabled) return
    const store = db()
    store
      .prepare(`INSERT INTO events (ts, kind, query, tab, page, lang, ms, ok, cached, results, error, model, tokens_in, tokens_out, detail)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        Date.now(),
        event.kind,
        settings.usage.recordQueries ? clip(event.query, 300) : null,
        event.tab ?? null,
        event.page ?? null,
        event.lang ?? null,
        Math.round(event.ms),
        event.ok ? 1 : 0,
        event.cached === undefined ? null : event.cached ? 1 : 0,
        event.results ?? null,
        clip(event.error, 300),
        event.model ?? null,
        event.tokensIn ?? null,
        event.tokensOut ?? null,
        event.detail ? JSON.stringify(event.detail) : null,
      )
    prune(store, settings.usage.retentionDays)
  } catch (error) {
    console.error('usage log failed:', error instanceof Error ? error.message : error)
  }
}

export async function recordEngineCalls(
  calls: Array<{ engine: string; ok: boolean; results: number; error?: string }>,
): Promise<void> {
  try {
    if (!calls.length || !(await readSettings()).settings.usage.enabled) return
    const insert = db().prepare('INSERT INTO engine_calls (ts, engine, ok, results, error) VALUES (?, ?, ?, ?, ?)')
    const now = Date.now()
    for (const call of calls) insert.run(now, call.engine, call.ok ? 1 : 0, call.results, clip(call.error, 200))
  } catch (error) {
    console.error('usage log failed:', error instanceof Error ? error.message : error)
  }
}

function prune(store: DatabaseSync, days: number) {
  const now = Date.now()
  if (now - lastPrune < 3_600_000) return
  lastPrune = now
  const cutoff = now - days * 86_400_000
  store.prepare('DELETE FROM events WHERE ts < ?').run(cutoff)
  store.prepare('DELETE FROM engine_calls WHERE ts < ?').run(cutoff)
}

/** Times a unit of work and records it, success or failure, without altering its outcome. */
export async function measure<T>(
  base: Omit<UsageInput, 'ms' | 'ok'>,
  work: () => Promise<T>,
  describe?: (result: T) => Partial<UsageInput>,
): Promise<T> {
  const started = performance.now()
  try {
    const result = await work()
    void recordUsage({ ...base, ...describe?.(result), ms: performance.now() - started, ok: true })
    return result
  } catch (error) {
    void recordUsage({
      ...base,
      ms: performance.now() - started,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

type Row = Record<string, SQLInputValue | null>
const all = (sql: string, ...params: SQLInputValue[]) =>
  db()
    .prepare(sql)
    .all(...params) as Row[]
const num = (value: unknown) => (typeof value === 'number' ? value : Number(value ?? 0))

function percentile(kind: UsageKind, since: number, count: number, fraction: number): number {
  if (!count) return 0
  const offset = Math.min(count - 1, Math.floor(count * fraction))
  return num(
    all('SELECT ms FROM events WHERE kind = ? AND ts >= ? ORDER BY ms LIMIT 1 OFFSET ?', kind, since, offset)[0]?.ms,
  )
}

export function usageReport(since: number, bucketMs: number): UsageReport {
  const kinds: KindStats[] = KINDS.map(kind => {
    const row = all(
      `SELECT COUNT(*) n, SUM(ok = 0) errors, SUM(cached = 1) cached, SUM(tokens_in) tin, SUM(tokens_out) tout
      FROM events WHERE kind = ? AND ts >= ?`,
      kind,
      since,
    )[0]!
    const count = num(row.n)
    return {
      kind,
      count,
      errors: num(row.errors),
      cached: num(row.cached),
      tokensIn: num(row.tin),
      tokensOut: num(row.tout),
      p50: percentile(kind, since, count, 0.5),
      p95: percentile(kind, since, count, 0.95),
    }
  })
  const series = all(
    `SELECT CAST(ts / ? AS INTEGER) * ? bucket, SUM(kind = 'search') search, SUM(kind = 'summary') summary, SUM(ok = 0) errors
    FROM events WHERE ts >= ? GROUP BY bucket ORDER BY bucket`,
    bucketMs,
    bucketMs,
    since,
  ).map(row => ({ ts: num(row.bucket), search: num(row.search), summary: num(row.summary), errors: num(row.errors) }))
  const topQueries = all(
    `SELECT query, COUNT(*) n FROM events WHERE kind = 'search' AND ts >= ? AND query IS NOT NULL
    GROUP BY lower(query) ORDER BY n DESC, MAX(ts) DESC LIMIT 20`,
    since,
  ).map(row => ({ query: String(row.query), count: num(row.n) }))
  const zeroResultQueries = all(
    `SELECT query, COUNT(*) n FROM events WHERE kind = 'search' AND ok = 1 AND results = 0 AND ts >= ? AND query IS NOT NULL
    GROUP BY lower(query) ORDER BY n DESC, MAX(ts) DESC LIMIT 10`,
    since,
  ).map(row => ({ query: String(row.query), count: num(row.n) }))
  const engines: EngineStats[] = all(
    `SELECT engine, COUNT(*) calls, SUM(ok = 0) failures, SUM(results) results,
      (SELECT error FROM engine_calls e2 WHERE e2.engine = e1.engine AND e2.ok = 0 AND e2.ts >= ? ORDER BY ts DESC LIMIT 1) last_error
    FROM engine_calls e1 WHERE ts >= ? GROUP BY engine ORDER BY calls DESC`,
    since,
    since,
  ).map(row => ({
    engine: String(row.engine),
    calls: num(row.calls),
    failures: num(row.failures),
    results: num(row.results),
    lastError: row.last_error === null ? null : String(row.last_error),
  }))
  const intents = all(
    `SELECT json_extract(detail, '$.intent') intent, COUNT(*) n FROM events
    WHERE kind = 'intent' AND ts >= ? AND intent IS NOT NULL GROUP BY intent ORDER BY n DESC`,
    since,
  ).map(row => ({ intent: String(row.intent), count: num(row.n) }))
  return { since, bucketMs, kinds, series, topQueries, zeroResultQueries, engines, intents }
}

export function usageEvents(options: {
  kind?: UsageKind
  failedOnly?: boolean
  before?: number
  limit: number
}): UsageEvent[] {
  const where = ['1 = 1']
  const params: SQLInputValue[] = []
  if (options.kind) {
    where.push('kind = ?')
    params.push(options.kind)
  }
  if (options.failedOnly) where.push('ok = 0')
  if (options.before) {
    where.push('id < ?')
    params.push(options.before)
  }
  return all(
    `SELECT * FROM events WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`,
    ...params,
    options.limit,
  ).map(row => ({
    id: num(row.id),
    ts: num(row.ts),
    kind: row.kind as UsageKind,
    query: row.query as string | null,
    tab: row.tab as string | null,
    page: row.page === null ? null : num(row.page),
    lang: row.lang as string | null,
    ms: num(row.ms),
    ok: row.ok === 1,
    cached: row.cached === null ? null : row.cached === 1,
    results: row.results === null ? null : num(row.results),
    error: row.error as string | null,
    model: row.model as string | null,
    tokensIn: row.tokens_in === null ? null : num(row.tokens_in),
    tokensOut: row.tokens_out === null ? null : num(row.tokens_out),
    detail: typeof row.detail === 'string' ? (JSON.parse(row.detail) as UsageDetail) : null,
  }))
}

export function clearUsage(): number {
  const store = db()
  const removed = num(store.prepare('SELECT COUNT(*) n FROM events').get()?.n)
  store.exec('DELETE FROM events; DELETE FROM engine_calls; VACUUM;')
  return removed
}

export function usageSize(): { events: number; oldest: number | null } {
  const row = db().prepare('SELECT COUNT(*) n, MIN(ts) oldest FROM events').get()
  return { events: num(row?.n), oldest: row?.oldest == null ? null : num(row.oldest) }
}
