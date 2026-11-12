import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings, type Settings } from '~/lib/settings'

const config = vi.hoisted(() => ({ DATA_DIR: '' }))
vi.mock('./env.server', () => ({ env: () => config }))

let directory: string
let file: string
beforeEach(async () => {
  vi.resetModules()
  directory = await mkdtemp(join(tmpdir(), 'searxng-settings-test-'))
  config.DATA_DIR = directory
  file = join(directory, 'settings.json')
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('settings persistence', () => {
  it('returns fresh defaults with revision zero without creating a file', async () => {
    const { readSettings } = await import('./settings.server')
    const first = await readSettings()
    expect(first).toEqual({ revision: 0, updatedAt: null, settings: defaultSettings() })
    first.settings.engines.google = { enabled: false, weight: 2 }
    expect((await readSettings()).settings.engines).toEqual({})
    expect(await readdir(directory)).toEqual([])
  })

  it('creates nested storage, persists normalized settings, and survives module reload', async () => {
    config.DATA_DIR = join(directory, 'nested', 'settings')
    file = join(config.DATA_DIR, 'settings.json')
    const { saveSettings, readSettings } = await import('./settings.server')
    const settings = {
      ...defaultSettings(),
      defaultLanguage: 'de',
      safeSearch: 2 as const,
      blockedHosts: ['  EXAMPLE.ORG  '],
      engines: { google: { enabled: false, weight: 2 } },
    }
    const saved = await saveSettings(settings, 0)
    expect(saved).toMatchObject({ revision: 1, settings: { ...settings, blockedHosts: ['example.org'] } })
    expect(Number.isFinite(Date.parse(saved.updatedAt!))).toBe(true)
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(saved)
    expect(await readSettings()).toEqual(saved)
    vi.resetModules()
    expect(await (await import('./settings.server')).readSettings()).toEqual(saved)
    expect((await readdir(config.DATA_DIR)).sort()).toEqual(['history.jsonl', 'settings.json'])
    if (process.platform !== 'win32') {
      expect((await stat(file)).mode & 0o777).toBe(0o600)
      expect((await stat(config.DATA_DIR)).mode & 0o777).toBe(0o700)
    }
  })

  it('increments revisions and backs up exactly the previous committed snapshot', async () => {
    const { saveSettings, readSettings } = await import('./settings.server')
    const first = await saveSettings(defaultSettings(), 0)
    const second = await saveSettings({ ...first.settings, safeSearch: 0 }, 1)
    expect(second.revision).toBe(2)
    expect(await readSettings()).toEqual(second)
    expect(JSON.parse(await readFile(`${file}.bak`, 'utf8'))).toEqual(first)
    const third = await saveSettings({ ...second.settings, aiAuto: false }, 2)
    expect(third.revision).toBe(3)
    expect(JSON.parse(await readFile(`${file}.bak`, 'utf8'))).toEqual(second)
    expect((await readdir(directory)).sort()).toEqual(['history.jsonl', 'settings.json', 'settings.json.bak'])
    if (process.platform !== 'win32') expect((await stat(`${file}.bak`)).mode & 0o777).toBe(0o600)
  })

  it('rejects stale revisions without touching the current file or its backup', async () => {
    const { saveSettings, readSettings } = await import('./settings.server')
    const initial = await saveSettings(defaultSettings(), 0)
    const latest = await saveSettings({ ...initial.settings, safeSearch: 2 }, 1)
    const before = await readFile(file, 'utf8')
    const backup = await readFile(`${file}.bak`, 'utf8')
    await expect(saveSettings({ ...initial.settings, safeSearch: 0 }, 1)).rejects.toThrow('settingsConflict')
    expect(await readFile(file, 'utf8')).toBe(before)
    expect(await readFile(`${file}.bak`, 'utf8')).toBe(backup)
    expect(await readSettings()).toEqual(latest)
    expect((await saveSettings(latest.settings, 2)).revision).toBe(3)
  })

  it('allows only one concurrent writer for a given revision and recovers the queue after conflicts', async () => {
    const { saveSettings, readSettings } = await import('./settings.server')
    const contenders = [0, 1, 2].map(safeSearch => ({ ...defaultSettings(), safeSearch }) as Settings)
    const outcomes = await Promise.allSettled(contenders.map(settings => saveSettings(settings, 0)))
    const winners = outcomes.flatMap(result => (result.status === 'fulfilled' ? [result.value] : []))
    const conflicts = outcomes.flatMap(result => (result.status === 'rejected' ? [result.reason as Error] : []))
    expect(winners).toHaveLength(1)
    expect(conflicts).toHaveLength(2)
    expect(conflicts.every(error => error.message === 'settingsConflict')).toBe(true)
    expect(await readSettings()).toEqual(winners[0])
    const next = await saveSettings({ ...winners[0]!.settings, aiEnabled: false }, 1)
    expect(next.revision).toBe(2)
    expect(JSON.parse(await readFile(`${file}.bak`, 'utf8'))).toEqual(winners[0])
  })

  it('never exposes partial JSON to readers during queued writes', async () => {
    const { saveSettings, readSettings } = await import('./settings.server')
    const settings = defaultSettings()
    await saveSettings(settings, 0)
    const writes = Array.from({ length: 12 }, (_, index) =>
      saveSettings(
        {
          ...settings,
          safeSearch: index % 2 === 0 ? 0 : 2,
        },
        index + 1,
      ),
    )
    const reads = Array.from({ length: 30 }, async () => {
      const snapshot = await readSettings()
      expect(Number.isSafeInteger(snapshot.revision)).toBe(true)
      expect(snapshot.revision).toBeGreaterThanOrEqual(1)
      expect(snapshot.revision).toBeLessThanOrEqual(13)
      expect(snapshot.settings).toMatchObject({ aiEnabled: true, engines: {} })
      expect([0, 1, 2]).toContain(snapshot.settings.safeSearch)
    })
    await Promise.all([...writes, ...reads])
    expect((await readSettings()).revision).toBe(13)
    expect((await readdir(directory)).some(name => name.endsWith('.tmp'))).toBe(false)
  })

  it('rejects invalid settings without writing and permits subsequent valid saves', async () => {
    const { saveSettings, readSettings } = await import('./settings.server')
    const first = await saveSettings(defaultSettings(), 0)
    await expect(saveSettings({ ...first.settings, safeSearch: 9 } as unknown as Settings, 1)).rejects.toThrow()
    expect(await readSettings()).toEqual(first)
    expect((await readdir(directory)).sort()).toEqual(['history.jsonl', 'settings.json'])
    expect((await saveSettings({ ...first.settings, aiAuto: false }, 1)).revision).toBe(2)
  })

  it.each([
    ['malformed JSON', '{'],
    ['revision zero', JSON.stringify({ revision: 0, updatedAt: 'now', settings: {} })],
    ['fractional revision', JSON.stringify({ revision: 1.5, updatedAt: 'now', settings: {} })],
    ['unsafe revision', JSON.stringify({ revision: Number.MAX_SAFE_INTEGER + 1, updatedAt: 'now', settings: {} })],
    ['missing timestamp', JSON.stringify({ revision: 1, settings: {} })],
    [
      'invalid settings',
      JSON.stringify({ revision: 1, updatedAt: 'now', settings: { blockedHosts: ['not a domain'] } }),
    ],
  ])('surfaces %s instead of silently replacing stored data', async (_label, contents) => {
    await writeFile(file, contents)
    const { readSettings, saveSettings } = await import('./settings.server')
    await expect(readSettings()).rejects.toThrow()
    await expect(saveSettings(defaultSettings(), 0)).rejects.toThrow()
    expect(await readFile(file, 'utf8')).toBe(contents)
    expect(await readdir(directory)).toEqual(['settings.json'])
  })
})

describe('change history', () => {
  it('logs what changed, restores earlier settings as a new revision and trims old entries', async () => {
    const { readHistory, readSettings, restoreBefore, saveSettings } = await import('./settings.server')
    const next = (change: (s: Settings) => void) => async () => {
      const current = await readSettings()
      const settings = structuredClone(current.settings)
      change(settings)
      return saveSettings(settings, current.revision, ['@secret:ai:updated'])
    }
    await next(s => {
      s.safeSearch = 2
    })()
    await next(s => {
      s.safeSearch = 0
    })()
    const history = await readHistory()
    expect(history.map(h => h.revision)).toEqual([2, 1])
    expect(history[0]!.changes).toEqual(['safeSearch: 2 → 0', '@secret:ai:updated'])
    expect(JSON.stringify(history)).not.toContain('"before"')

    const restored = await restoreBefore(2, (await readSettings()).revision)
    expect(restored.revision).toBe(3)
    expect(restored.settings.safeSearch).toBe(2)
    await expect(restoreBefore(99, 3)).rejects.toThrow('historyNotFound')

    for (let i = 0; i < 55; i++)
      await next(s => {
        s.limits.searchPerMinute = 10 + i
      })()
    expect(await readHistory()).toHaveLength(50)
  })
})
