import type { LanguageOption } from './settings'

export type UiLocale = 'zh-CN' | 'zh-TW' | 'en' | 'ja' | 'de' | 'fr' | 'es'

/** Parse preferences in descending quality order, preserving order for equal weights. */
function languagePreferences(header: string): string[] {
  return header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...parameters] = part.trim().split(';')
      const quality = parameters.find(parameter => /^\s*q\s*=/i.test(parameter))
      const q = quality ? Number(quality.split('=')[1]?.trim()) : 1
      return { tag: tag.trim().replaceAll('_', '-').toLowerCase(), q, index }
    })
    .filter(({ tag, q }) => /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(tag) && Number.isFinite(q) && q > 0 && q <= 1)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map(({ tag }) => tag)
}

/** UI language is independent of the language selected for search results. */
export function resolveUiLocale(acceptLanguage: string): UiLocale {
  for (const tag of languagePreferences(acceptLanguage)) {
    const base = tag.split('-')[0]
    if (base === 'zh') return /(?:^|-)(?:hant|tw|hk|mo)(?:-|$)/.test(tag) ? 'zh-TW' : 'zh-CN'
    if (base === 'en' || base === 'ja' || base === 'de' || base === 'fr' || base === 'es') return base
  }
  return 'en'
}

function normalizedCode(code: string): string {
  return code.trim().replaceAll('_', '-').toLowerCase()
}

/** Return the actual advertised code, including its original spelling and region. */
function supportedCode(language: string, supported: readonly LanguageOption[]): string | undefined {
  const requested = normalizedCode(language)
  if (!requested || requested === 'auto' || requested === '*') return undefined
  const exact = supported.find(({ code }) => normalizedCode(code) === requested)
  if (exact) return exact.code
  const base = requested.split('-')[0]
  const candidates = supported.filter(({ code }) => normalizedCode(code).split('-')[0] === base)
  if (base === 'zh') {
    const traditional = /(?:^|-)(?:hant|tw|hk|mo)(?:-|$)/.test(requested)
    const preferred = candidates.find(({ code }) =>
      traditional
        ? /(?:^|-)(?:hant|tw|hk|mo)(?:-|$)/.test(normalizedCode(code))
        : /(?:^|-)(?:hans|cn|sg)(?:-|$)/.test(normalizedCode(code)),
    )
    if (preferred) return preferred.code
  }
  return candidates.find(({ code }) => normalizedCode(code) === base)?.code ?? candidates[0]?.code
}

export function browserSearchLanguage(acceptLanguage: string, supported: readonly LanguageOption[]): string {
  for (const preference of languagePreferences(acceptLanguage)) {
    const code = supportedCode(preference, supported)
    if (code) return code
  }
  return 'all'
}

const LATIN_WORDS = {
  en: new Set(['the', 'and', 'with', 'from', 'this', 'that', 'does', 'are', 'your', 'for', 'what', 'how']),
  fr: new Set(['les', 'des', 'une', 'pour', 'avec', 'dans', 'est', 'pas', 'que', 'qui', 'comment']),
  de: new Set(['der', 'die', 'das', 'und', 'mit', 'für', 'ist', 'wie', 'was', 'ein', 'eine', 'von']),
  es: new Set(['los', 'las', 'una', 'para', 'con', 'del', 'que', 'qué', 'cómo', 'por', 'son']),
}
const DISTINCTIVE_WORDS = {
  en: new Set([
    'hello',
    'weather',
    'search',
    'tutorial',
    'documentation',
    'difference',
    'between',
    'where',
    'why',
    'which',
    'what',
    'how',
    'when',
    'book',
    'best',
    'learn',
  ]),
  fr: new Set([
    'bonjour',
    'météo',
    'recherche',
    'français',
    'pourquoi',
    'meilleur',
    'aujourd’hui',
    'fonctionne',
    'installer',
  ]),
  de: new Set([
    'hallo',
    'wetter',
    'suche',
    'deutsch',
    'warum',
    'funktioniert',
    'unterschied',
    'zwischen',
    'guten',
    'morgen',
  ]),
  es: new Set(['hola', 'tiempo', 'buscar', 'español', 'porque', 'funciona', 'diferencia', 'entre', 'dónde']),
}

/** Conservative script/word detection; short or ambiguous Latin queries stay automatic. */
export function detectQueryLanguage(query: string): string | undefined {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(query)) return 'ja'
  if (/\p{Script=Hangul}/u.test(query)) return 'ko'
  if (/\p{Script=Han}/u.test(query)) return 'zh'
  if (/\p{Script=Cyrillic}/u.test(query)) return 'ru'
  if (/\p{Script=Arabic}/u.test(query)) return 'ar'
  const words = [
    ...new Set(
      query
        .toLowerCase()
        .normalize('NFC')
        .match(/\p{Script=Latin}+(?:[’']\p{Script=Latin}+)*/gu) ?? [],
    ),
  ]
  const scores = (Object.keys(LATIN_WORDS) as Array<keyof typeof LATIN_WORDS>)
    .map(language => ({
      language,
      score: words.reduce(
        (score, word) => score + (DISTINCTIVE_WORDS[language].has(word) ? 2 : LATIN_WORDS[language].has(word) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score)
  return scores[0]!.score >= 2 && scores[0]!.score > scores[1]!.score ? scores[0]!.language : undefined
}

/** Manual choice > administrator default > query detection > browser preferences. */
export function resolveSearchLanguage(
  query: string,
  explicit: string,
  browserHeader: string,
  supported: readonly LanguageOption[],
  defaultLanguage: string,
): string {
  if (explicit === 'all') return 'all'
  const manual = supportedCode(explicit, supported)
  if (manual) return manual
  if (defaultLanguage === 'all') return 'all'
  const configured = supportedCode(defaultLanguage, supported)
  if (configured) return configured
  const detected = detectQueryLanguage(query)
  const queryCode = detected ? supportedCode(detected, supported) : undefined
  return queryCode ?? browserSearchLanguage(browserHeader, supported)
}
