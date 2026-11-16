/**
 * Errors that reach a person carry a stable code instead of prose. The server
 * never picks a language; the page translates the code into the visitor's.
 */
export const ERROR_CODES = [
  'unauthorized',
  'crossSite',
  'adminNotConfigured',
  'wrongPassword',
  'rateLimited',
  'catalogChanged',
  'catalogUnavailable',
  'noWebEngine',
  'unsupportedLanguage',
  'invalidDomain',
  'secretNeedsPassword',
  'secretFileInvalid',
  'settingsFileInvalid',
  'settingsConflict',
  'historyNotFound',
  'aiUnavailable',
  'noKey',
  'noModel',
  'timeout',
  'unreachable',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value)

/** The message is the code itself, so it survives server-function serialization unchanged. */
export class AppError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code)
    this.name = 'AppError'
  }
}

/** The code behind an error, if it has one. Validation failures arrive as a JSON list of issues. */
export function errorCode(error: unknown): ErrorCode | undefined {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (isErrorCode(message)) return message
  if (!message.startsWith('[')) return undefined
  try {
    const issues: unknown = JSON.parse(message)
    return Array.isArray(issues)
      ? issues.map(issue => (issue as { message?: unknown } | null)?.message).find(isErrorCode)
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Settings-history entries are stored once and read in any language: field
 * changes are written as key paths, and events as tokens the page translates.
 */
export const historyToken = {
  reset: () => '@reset',
  restore: (revision: number) => `@restore:${revision}`,
  secret: (name: string, removed: boolean) => `@secret:${name}:${removed ? 'removed' : 'updated'}`,
  edited: (field: string) => `@edited:${field}`,
}
