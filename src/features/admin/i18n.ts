import { type ErrorCode, errorCode, isErrorCode } from '~/lib/errors'
import { useI18n } from '~/lib/i18n'
import type { UsageKind } from '~/lib/settings'
import { type AdminTextKey, adminText, en } from './messages'

export { adminText }

/** Admin wording in the visitor's interface language. */
export function useAdminText() {
  const i18n = useI18n()
  const t = (key: AdminTextKey, values?: Record<string, string | number>) => adminText(i18n.locale, key, values)
  const codeText = (code: ErrorCode) => t(`err_${code}`)
  return {
    t,
    get locale() {
      return i18n.locale
    },
    kind: (kind: UsageKind) => t(`kind_${kind}`),
    category: (name: string) => (`cat_${name}` in en ? t(`cat_${name}` as AdminTextKey) : name),
    /** An error from any source; unknown messages are shown as they are, after a generic lead. */
    error: (error: unknown) => {
      const code = errorCode(error)
      if (code) return codeText(code)
      const message = error instanceof Error ? error.message.trim() : ''
      return message && message.length <= 200 ? `${t('failed')}: ${message}` : t('failed')
    },
    /** Short status strings from the server: a code, or upstream text such as "HTTP 502". */
    status: (value: string) => (isErrorCode(value) ? codeText(value) : value),
    /** One settings-history entry: a key-path diff, or a token for an event. */
    change: (entry: string) => {
      const [kind, a, b] = entry.split(':')
      if (kind === '@reset') return t('hist_reset')
      if (kind === '@restore' && a) return t('hist_restore', { revision: a })
      if (kind === '@secret' && a) return t(b === 'removed' ? 'hist_secretRemoved' : 'hist_secretUpdated', { name: a })
      if (kind === '@edited' && a) return t('hist_edited', { field: a })
      return entry
    },
    uptime: (sec: number) =>
      sec >= 86_400
        ? t('days', { n: Math.floor(sec / 86_400) })
        : sec >= 3600
          ? t('hours', { n: Math.floor(sec / 3600) })
          : t('minutes', { n: Math.floor(sec / 60) }),
  }
}

export type AdminText = ReturnType<typeof useAdminText>
