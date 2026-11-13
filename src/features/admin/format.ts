import type { UsageKind } from '~/lib/settings'

export const USAGE_KINDS: readonly UsageKind[] = ['search', 'suggest', 'intent', 'summary', 'live']

export const formatMs = (ms: number) =>
  ms >= 10_000 ? `${(ms / 1000).toFixed(0)} s` : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`
export const formatPercent = (part: number, total: number) =>
  total ? `${((part / total) * 100).toFixed(part / total < 0.1 ? 1 : 0)}%` : '—'
export const formatCount = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : String(n))
export const formatTime = (ts: number) =>
  new Date(ts).toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
