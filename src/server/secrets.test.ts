import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: { DATA_DIR: '', ADMIN_PASSWORD: 'correct horse battery' as string | undefined },
}))
vi.mock('./env.server', () => ({ env: () => mocks.config }))

beforeEach(async () => {
  vi.resetModules()
  mocks.config.DATA_DIR = await mkdtemp(join(tmpdir(), 'secrets-'))
  mocks.config.ADMIN_PASSWORD = 'correct horse battery'
})
afterEach(() => rm(mocks.config.DATA_DIR, { recursive: true, force: true }))

describe('encrypted secrets', () => {
  it('round-trips without writing plaintext and exposes only the last four characters', async () => {
    const { readSecret, secretStatus, writeSecret } = await import('./secrets.server')
    await writeSecret('ai', 'sk-test-1234567890')
    expect(await readSecret('ai')).toBe('sk-test-1234567890')
    expect(await secretStatus('ai')).toEqual({ source: 'admin', last4: '7890' })
    expect(await readFile(join(mocks.config.DATA_DIR, 'secrets.json'), 'utf8')).not.toContain('sk-test')
    expect(await secretStatus('jev')).toEqual({ source: 'none' })
  })

  it('removes keys and reports an unreadable one after the password changes', async () => {
    const { readSecret, secretStatus, writeSecret } = await import('./secrets.server')
    await writeSecret('ai', 'sk-test-1234567890')
    mocks.config.ADMIN_PASSWORD = 'a different password!'
    expect(await readSecret('ai')).toBeUndefined()
    expect(await secretStatus('ai')).toEqual({ source: 'none', unreadable: true })
    mocks.config.ADMIN_PASSWORD = 'correct horse battery'
    await writeSecret('ai', null)
    expect(await secretStatus('ai')).toEqual({ source: 'none' })
  })

  it('refuses to store keys without an administrator password', async () => {
    mocks.config.ADMIN_PASSWORD = undefined
    const { writeSecret } = await import('./secrets.server')
    await expect(writeSecret('ai', 'sk-test-1234567890')).rejects.toThrow('secretNeedsPassword')
  })
})
