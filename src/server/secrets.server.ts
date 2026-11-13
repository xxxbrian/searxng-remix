import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { AppError } from '~/lib/errors'
import type { SecretName, SecretStatus } from '~/lib/settings'
import { env } from './env.server'

/**
 * Write-only API keys, encrypted at rest with AES-256-GCM. The key is derived
 * from ADMIN_PASSWORD, so a copy of data/ alone does not reveal them. Changing
 * the password makes stored keys unreadable until they are entered again.
 */
interface Sealed {
  iv: string
  tag: string
  data: string
  last4: string
}
interface SecretFile {
  version: 1
  salt: string
  items: Partial<Record<SecretName, Sealed>>
}

const filePath = () => join(env().DATA_DIR, 'secrets.json')
let writeQueue: Promise<unknown> = Promise.resolve()
let keyCache: { password: string; salt: string; key: Buffer } | undefined

function deriveKey(salt: string): Buffer {
  const password = env().ADMIN_PASSWORD
  if (!password) throw new AppError('secretNeedsPassword')
  if (keyCache?.password === password && keyCache.salt === salt) return keyCache.key
  const key = scryptSync(password, Buffer.from(salt, 'base64'), 32)
  keyCache = { password, salt, key }
  return key
}

async function readFileOrEmpty(): Promise<SecretFile> {
  try {
    const raw = JSON.parse(await readFile(filePath(), 'utf8')) as SecretFile
    if (raw.version !== 1 || typeof raw.salt !== 'string') throw new AppError('secretFileInvalid')
    return raw
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { version: 1, salt: randomBytes(16).toString('base64'), items: {} }
    throw error
  }
}

function open(file: SecretFile, name: SecretName): string | undefined {
  const sealed = file.items[name]
  if (!sealed) return undefined
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(file.salt), Buffer.from(sealed.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return undefined
  }
}

/** Decrypted value, or undefined when absent or unreadable. */
export async function readSecret(name: SecretName): Promise<string | undefined> {
  return open(await readFileOrEmpty(), name)
}

export async function secretStatus(name: SecretName): Promise<SecretStatus> {
  const file = await readFileOrEmpty()
  const sealed = file.items[name]
  if (!sealed) return { source: 'none' }
  return open(file, name) === undefined
    ? { source: 'none', unreadable: true }
    : { source: 'admin', last4: sealed.last4 }
}

/** `null` removes the stored key; a string replaces it. */
export function writeSecret(name: SecretName, value: string | null): Promise<void> {
  const job = writeQueue.then(async () => {
    const file = await readFileOrEmpty()
    if (value === null) delete file.items[name]
    else {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', deriveKey(file.salt), iv)
      const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
      file.items[name] = {
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: data.toString('base64'),
        last4: value.slice(-4),
      }
    }
    const path = filePath()
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    const temp = `${path}.${process.pid}.tmp`
    await writeFile(temp, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 })
    await rename(temp, path)
  })
  writeQueue = job.catch(() => undefined)
  return job
}
