import { historyToken } from './errors'
import type { Settings } from './settings'

const GROUPS = ['ai', 'jev', 'usage', 'limits', 'live'] as const
const HOST_LISTS = ['blockedHosts', 'demotedHosts', 'trustedHosts'] as const
const SCALARS = ['defaultLanguage', 'safeSearch', 'aiEnabled', 'aiAuto'] as const
/** Free text is noted, not copied, to keep the history compact. */
const LONG_TEXT = new Set(['ai.instructions'])

/** Values are shown as written; an empty string means "use the default". */
const show = (value: unknown) => (value === '' ? '""' : String(value))

/**
 * What changed, as key paths readable in any language. Never includes secret
 * values: keys are not in Settings.
 */
export function describeChanges(before: Settings, after: Settings): string[] {
  const changes: string[] = []
  for (const key of SCALARS)
    if (before[key] !== after[key]) changes.push(`${key}: ${show(before[key])} → ${show(after[key])}`)
  for (const group of GROUPS) {
    const left = before[group] as Record<string, unknown>
    const right = after[group] as Record<string, unknown>
    for (const key of Object.keys(right)) {
      if (left[key] === right[key]) continue
      changes.push(
        LONG_TEXT.has(`${group}.${key}`)
          ? historyToken.edited(`${group}.${key}`)
          : `${group}.${key}: ${show(left[key])} → ${show(right[key])}`,
      )
    }
  }
  for (const name of new Set([...Object.keys(before.engines), ...Object.keys(after.engines)])) {
    const left = before.engines[name]
    const right = after.engines[name]
    if (left?.enabled !== right?.enabled && right)
      changes.push(`engines.${name}.enabled: ${left?.enabled ?? '—'} → ${right.enabled}`)
    if (right && (left?.weight ?? 1) !== right.weight)
      changes.push(`engines.${name}.weight: ${left?.weight ?? 1} → ${right.weight}`)
  }
  for (const key of HOST_LISTS) {
    const old = new Set(before[key])
    const next = new Set(after[key])
    const added = [...next].filter(host => !old.has(host)).length
    const removed = [...old].filter(host => !next.has(host)).length
    if (added || removed) changes.push(`${key}: +${added} −${removed}`)
  }
  return changes
}
