import type { Settings } from '~/lib/settings'
import { cjkRatio } from '~/lib/text'
import type { Hit } from '~/lib/types'
import { BLOCKED_HOSTS, DEMOTED_HOSTS, matchesHost, TRUSTED_HOSTS } from './curation.server'

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|msclkid$|mc_|spm$|from$|share_)/i

/** Strips tracking parameters and fragments so equal pages compare equal. */
export function cleanUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key)
    }
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

const dedupeKey = (url: string): string => {
  const u = new URL(url)
  return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}${u.search}`
}

export interface RankContext {
  /** Whether the query itself is Chinese. */
  preferChinese: boolean
  policy?: Pick<Settings, 'blockedHosts' | 'trustedHosts' | 'demotedHosts'>
  engineWeights?: Record<string, { weight: number }>
}

/**
 * Input is ordered by upstream relevance; we turn position into a score, apply
 * taste (trusted/demoted hosts, language), then re-sort. Stable for ties.
 */
export function rank(hits: ReadonlyArray<Hit>, ctx: RankContext): Hit[] {
  const seen = new Set<string>()
  const scored: Array<{ hit: Hit; score: number }> = []

  hits.forEach((hit, index) => {
    if (matchesHost(hit.host, ctx.policy?.blockedHosts ?? BLOCKED_HOSTS)) return
    const key = dedupeKey(hit.url)
    if (seen.has(key)) return
    seen.add(key)

    let score = 1 / (index + 6) // gentle decay: position matters, not too much
    if (matchesHost(hit.host, ctx.policy?.trustedHosts ?? TRUSTED_HOSTS)) score *= 1.5
    if (matchesHost(hit.host, ctx.policy?.demotedHosts ?? DEMOTED_HOSTS)) score *= 0.5
    const weights = (hit.engines ?? []).map(name => ctx.engineWeights?.[name]?.weight ?? 1)
    score *= weights.length ? Math.max(...weights) : 1
    if (ctx.preferChinese && cjkRatio(`${hit.title}${hit.snippet}`) > 0.2) score *= 1.35
    scored.push({ hit, score })
  })

  return scored.sort((a, b) => b.score - a.score).map(s => s.hit)
}
