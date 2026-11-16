import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AppError, errorCode, historyToken } from './errors'
import { defaultSettings, settingsSchema } from './settings'

describe('error codes', () => {
  it('reads the code from an AppError, a plain message and a validation failure', () => {
    expect(errorCode(new AppError('rateLimited'))).toBe('rateLimited')
    // Server-function errors reach the browser as plain Errors carrying the message.
    expect(errorCode(new Error('settingsConflict'))).toBe('settingsConflict')
    const invalid = settingsSchema.safeParse({ ...defaultSettings(), blockedHosts: ['not a domain'] })
    expect(invalid.success).toBe(false)
    expect(errorCode(new Error(invalid.error!.message))).toBe('invalidDomain')
  })

  it('returns nothing for prose, unknown codes and malformed JSON', () => {
    expect(errorCode(new Error('Failed to fetch'))).toBeUndefined()
    expect(errorCode(new Error('notACode'))).toBeUndefined()
    expect(errorCode(new Error('[not json'))).toBeUndefined()
    expect(errorCode(new z.ZodError([]))).toBeUndefined()
    expect(errorCode(undefined)).toBeUndefined()
  })

  it('writes history tokens the admin can translate', () => {
    expect([
      historyToken.reset(),
      historyToken.restore(4),
      historyToken.secret('ai', true),
      historyToken.edited('ai.instructions'),
    ]).toEqual(['@reset', '@restore:4', '@secret:ai:removed', '@edited:ai.instructions'])
  })
})
