import { describe, expect, it } from 'vitest'
import {
  canAutoSummarize,
  decideIntent,
  FALLBACK_DECISION,
  instantAnswer,
  isNumericAnswer,
  showKnowledge,
} from './search-decision'
import type { Hit } from './types'

const hit = (
  host: string,
  snippet = 'A sufficiently detailed search excerpt that can support a cited explanation.',
): Hit => ({
  host,
  snippet,
  url: `https://${host}/reference`,
  title: 'Reference',
  crumbs: host,
})

describe('search presentation policy', () => {
  it('automates useful synthesis while leaving uncertain and concise queries manual', () => {
    for (const intent of ['explanation', 'comparison', 'procedure'] as const)
      expect(decideIntent(intent, 0.9).summary).toBe('auto')
    for (const intent of ['fact', 'exploration', 'unknown'] as const)
      expect(decideIntent(intent, 0.9).summary).toBe('manual')
    expect(FALLBACK_DECISION.summary).toBe('manual')
  })

  it('does not present encyclopedia paragraphs as current weather/live information', () => {
    for (const intent of ['weather', 'live', 'navigation'] as const) {
      const decision = decideIntent(intent, 1)
      expect(showKnowledge(decision)).toBe(false)
      expect(instantAnswer({ answers: ['A city has a temperate climate.'] }, decision)).toBeUndefined()
    }
  })

  it('removes answers repeated by a knowledge panel, preserving distinct answers', () => {
    const content =
      'According to the Köppen climate classification, London has a temperate oceanic climate. Winters are cool and summers are warm.'
    const infobox = { title: 'Climate', content, attributes: [], links: [] }
    expect(instantAnswer({ answers: [`${content} More at Wikipedia`], infobox }, FALLBACK_DECISION)).toBeUndefined()
    expect(instantAnswer({ answers: [`${content} More at Wikipedia`, '42'], infobox }, FALLBACK_DECISION)).toBe('42')
    expect(instantAnswer({ answers: ['  ', 'Distinct useful answer'] }, FALLBACK_DECISION)).toBe(
      'Distinct useful answer',
    )
  })

  it('uses large typography only for short numeric answers', () => {
    for (const answer of ['42', '4 kg = 8.82 lb', '$100 ≈ €92', '−273.15 °C'])
      expect(isNumericAnswer(answer)).toBe(true)
    for (const answer of ['London is a temperate oceanic city.', 'Paris', '2\nparagraphs', '1'.repeat(65)])
      expect(isNumericAnswer(answer)).toBe(false)
  })

  it('requires useful excerpts from two distinct hosts among the actual summary sources', () => {
    expect(canAutoSummarize({ hits: [hit('a.test'), hit('b.test')] })).toBe(true)
    expect(canAutoSummarize({ hits: [hit('a.test'), hit('a.test')] })).toBe(false)
    expect(canAutoSummarize({ hits: [hit('a.test'), hit('b.test', '')] })).toBe(false)
    expect(canAutoSummarize({ hits: [...Array.from({ length: 6 }, () => hit('a.test')), hit('b.test')] })).toBe(false)
  })
})
