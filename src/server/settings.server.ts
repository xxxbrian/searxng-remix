import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { AppError, historyToken } from '~/lib/errors'
import {
  defaultSettings,
  type HistoryEntry,
  type Settings,
  type SettingsSnapshot,
  settingsSchema,
} from '~/lib/settings'
import { describeChanges } from '~/lib/settings-diff'
import { env } from './env.server'

const filePath = () => join(env().DATA_DIR, 'settings.json')
const historyPath = () => join(env().DATA_DIR, 'history.jsonl')
const HISTORY_LIMIT = 50
interface StoredEntry extends HistoryEntry {
  before: Settings
}
let writeQueue: Promise<unknown> = Promise.resolve()

export async function readSettings(): Promise<SettingsSnapshot> {
  try {
    const raw = JSON.parse(await readFile(filePath(), 'utf8'))
    if (!Number.isSafeInteger(raw.revision) || raw.revision < 1 || typeof raw.updatedAt !== 'string') {
      throw new AppError('settingsFileInvalid')
    }
    return { revision: raw.revision, updatedAt: raw.updatedAt, settings: settingsSchema.parse(raw.settings) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { revision: 0, updatedAt: null, settings: defaultSettings() }
    }
    throw error
  }
}

/** Single-process write queue plus atomic rename: readers never see half a file. */
export function saveSettings(
  settings: Settings,
  expectedRevision: number,
  notes: string[] = [],
): Promise<SettingsSnapshot> {
  const job = writeQueue.then(async () => {
    const current = await readSettings()
    if (current.revision !== expectedRevision) throw new AppError('settingsConflict')
    const snapshot = {
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
      settings: settingsSchema.parse(settings),
    }
    const path = filePath()
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    if (current.revision > 0) await writeFile(`${path}.bak`, JSON.stringify(current, null, 2), { mode: 0o600 })
    const temp = `${path}.${process.pid}.tmp`
    await writeFile(temp, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 })
    await rename(temp, path)
    await appendHistory({
      revision: snapshot.revision,
      at: snapshot.updatedAt,
      changes: [...describeChanges(current.settings, snapshot.settings), ...notes],
      before: current.settings,
    })
    return snapshot
  })
  writeQueue = job.catch(() => undefined)
  return job
}

async function readStored(): Promise<StoredEntry[]> {
  try {
    return (await readFile(historyPath(), 'utf8')).split('\n').flatMap(line => {
      if (!line) return []
      try {
        return [JSON.parse(line) as StoredEntry]
      } catch {
        return []
      }
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

/** Append-only log, trimmed to the latest entries. Runs inside the settings write queue. */
async function appendHistory(entry: StoredEntry) {
  const line = `${JSON.stringify(entry)}\n`
  const existing = await readStored()
  if (existing.length < HISTORY_LIMIT) return appendFile(historyPath(), line, { mode: 0o600 })
  const temp = `${historyPath()}.${process.pid}.tmp`
  await writeFile(
    temp,
    `${[...existing.slice(-(HISTORY_LIMIT - 1)), entry].map(e => JSON.stringify(e)).join('\n')}\n`,
    { mode: 0o600 },
  )
  await rename(temp, historyPath())
}

/** Newest first. Snapshots stay on the server. */
export async function readHistory(): Promise<HistoryEntry[]> {
  return (await readStored()).reverse().map(({ revision, at, changes }) => ({ revision, at, changes }))
}

/** Restores the settings as they were before the given revision was saved, as a new revision. */
export async function restoreBefore(revision: number, expectedRevision: number): Promise<SettingsSnapshot> {
  const entry = (await readStored()).find(e => e.revision === revision)
  if (!entry) throw new AppError('historyNotFound')
  return saveSettings(settingsSchema.parse(entry.before), expectedRevision, [historyToken.restore(revision)])
}
