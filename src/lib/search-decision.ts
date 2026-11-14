import type { InfoboxData, SearchPage } from './types'

export const QUERY_INTENTS = [
  'navigation',
  'weather',
  'live',
  'explanation',
  'comparison',
  'procedure',
  'fact',
  'exploration',
  'unknown',
] as const
export type QueryIntent = (typeof QUERY_INTENTS)[number]

export interface SearchDecision {
  intent: QueryIntent
  summary: 'auto' | 'manual' | 'off'
  confidence: number
  source: 'jev' | 'fallback'
}

/** Uncertainty never starts a generation or hides ordinary web results. */
export const FALLBACK_DECISION: SearchDecision = {
  intent: 'unknown',
  summary: 'manual',
  confidence: 0,
  source: 'fallback',
}

export function decideIntent(intent: QueryIntent, confidence: number): SearchDecision {
  return {
    intent,
    confidence,
    source: 'jev',
    summary: ['navigation', 'weather', 'live'].includes(intent)
      ? 'off'
      : ['explanation', 'comparison', 'procedure'].includes(intent)
        ? 'auto'
        : 'manual',
  }
}

export function showKnowledge(decision: SearchDecision): boolean {
  // An encyclopedia's climate/history is not evidence of current conditions.
  return !['navigation', 'weather', 'live'].includes(decision.intent)
}

const comparable = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}]+/gu, '')

function repeatsKnowledge(answer: string, box: InfoboxData | undefined): boolean {
  if (!box) return false
  const left = comparable(answer)
  const right = comparable(box.content)
  const length = Math.min(left.length, right.length, 120)
  return length >= 60 && left.slice(0, length) === right.slice(0, length)
}

export function instantAnswer(
  page: Pick<SearchPage, 'answers' | 'infobox'>,
  decision: SearchDecision,
): string | undefined {
  if (!showKnowledge(decision)) return undefined
  return page.answers.map(answer => answer.trim()).find(answer => answer && !repeatsKnowledge(answer, page.infobox))
}

/** Only short numeric answers (calculations/conversions) get display typography. */
export function isNumericAnswer(answer: string): boolean {
  return Array.from(answer).length <= 64 && /^[+−≈=-]?\s*[\p{N}\p{Sc}]/u.test(answer) && !/[\n\r]/.test(answer)
}

export function canAutoSummarize(page: Pick<SearchPage, 'hits'>): boolean {
  const sources = page.hits.slice(0, 6).filter(hit => hit.snippet.trim().length >= 40)
  return new Set(sources.map(hit => hit.host)).size >= 2
}
