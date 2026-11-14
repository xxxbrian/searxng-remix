import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '~/lib/settings'

const mocks = vi.hoisted(() => ({
  config: { DATA_DIR: '' },
  settings: undefined as unknown as ReturnType<typeof defaultSettings>,
}))
vi.mock('./env.server', () => ({ env: () => mocks.config }))
vi.mock('./settings.server', () => ({ readSettings: async () => ({ settings: mocks.settings }) }))

beforeEach(async () => {
  vi.resetModules()
  mocks.config.DATA_DIR = await mkdtemp(join(tmpdir(), 'usage-'))
  mocks.settings = defaultSettings()
})
afterEach(() => rm(mocks.config.DATA_DIR, { recursive: true, force: true }))

describe('usage log', () => {
  it('records timings, tokens and queries, and summarises them', async () => {
    const { recordUsage, recordEngineCalls, usageReport, usageEvents } = await import('./usage.server')
    for (const ms of [100, 200, 300, 400])
      await recordUsage({
        kind: 'search',
        query: 'Rust',
        ms,
        ok: true,
        cached: ms === 100,
        results: ms === 400 ? 0 : 5,
      })
    await recordUsage({ kind: 'search', query: 'boom', ms: 50, ok: false, error: 'upstream down' })
    await recordUsage({ kind: 'summary', query: 'Rust', ms: 2000, ok: true, model: 'm', tokensIn: 300, tokensOut: 80 })
    await recordUsage({ kind: 'intent', query: 'Rust', ms: 10, ok: true, detail: { intent: 'fact' } })
    await recordEngineCalls([
      { engine: 'bing', ok: true, results: 9 },
      { engine: 'ddg', ok: false, results: 0, error: 'timeout' },
    ])
    const report = usageReport(0, 3_600_000)
    const search = report.kinds.find(k => k.kind === 'search')!
    expect(search).toMatchObject({ count: 5, errors: 1, cached: 1 })
    expect(search.p95).toBeGreaterThanOrEqual(search.p50)
    expect(report.kinds.find(k => k.kind === 'summary')).toMatchObject({ tokensIn: 300, tokensOut: 80 })
    expect(report.topQueries[0]).toEqual({ query: 'Rust', count: 4 })
    expect(report.zeroResultQueries).toEqual([{ query: 'Rust', count: 1 }])
    expect(report.engines.find(e => e.engine === 'ddg')).toMatchObject({ failures: 1, lastError: 'timeout' })
    expect(report.intents).toEqual([{ intent: 'fact', count: 1 }])
    // Buckets must be aligned to the bucket size, or the chart finds no matching timestamps.
    expect(report.series.reduce((sum, p) => sum + p.search, 0)).toBe(5)
    expect(report.series.every(p => p.ts % 3_600_000 === 0)).toBe(true)
    expect(usageEvents({ kind: 'search', failedOnly: true, limit: 10 })).toHaveLength(1)
  })

  it('stores no query text when disabled and nothing when usage logging is off', async () => {
    const { recordUsage, usageEvents } = await import('./usage.server')
    mocks.settings.usage.recordQueries = false
    await recordUsage({ kind: 'search', query: 'private', ms: 1, ok: true })
    mocks.settings.usage.enabled = false
    await recordUsage({ kind: 'search', query: 'ignored', ms: 1, ok: true })
    const events = usageEvents({ limit: 10 })
    expect(events).toHaveLength(1)
    expect(events[0]!.query).toBeNull()
  })

  it('measure rethrows failures after logging them', async () => {
    const { measure, usageEvents } = await import('./usage.server')
    await expect(
      measure({ kind: 'suggest', query: 'x' }, async () => {
        throw new Error('nope')
      }),
    ).rejects.toThrow('nope')
    await vi.waitFor(() => expect(usageEvents({ limit: 1 })[0]).toMatchObject({ ok: false, error: 'nope' }))
  })
})
