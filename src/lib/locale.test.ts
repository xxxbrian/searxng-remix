import { describe, expect, it } from 'vitest'
import { browserSearchLanguage, detectQueryLanguage, resolveSearchLanguage, resolveUiLocale } from './locale'

const supported = ['en', 'en-US', 'fr', 'de', 'es', 'ja', 'ko', 'ru', 'ar', 'zh-CN', 'zh-TW', 'pt_BR'].map(code => ({
  code,
  name: code,
}))

describe('browser language preferences', () => {
  it.each([
    ['en;q=0.2,fr;q=0.9,de;q=0.6', 'fr'],
    ['de;q=0.8,fr;q=0.8', 'de'],
    ['fr;q=0,de;q=bogus,en;q=1.5,ja;q=-1,es;q=0.4', 'es'],
    ['xx-YY,fr-CA;q=0.8,en;q=0.5', 'fr'],
    [' EN_us ; Q = 0.9 , de;q=0.1', 'en-US'],
    ['pt-PT', 'pt_BR'],
    ['zh-Hant-HK', 'zh-TW'],
    ['zh-Hans-SG', 'zh-CN'],
    ['zh', 'zh-CN'],
    ['en-GB', 'en'],
    ['', 'all'],
    ['*;q=1,xx;q=0.5', 'all'],
    ['en;q=NaN,fr;q=Infinity', 'all'],
  ])('resolves %j to the advertised code %s', (header, expected) => {
    expect(browserSearchLanguage(header, supported)).toBe(expected)
  })

  it('uses all when no languages are advertised', () => {
    expect(browserSearchLanguage('en-US,en;q=0.9', [])).toBe('all')
  })
})

describe('query language detection', () => {
  it.each([
    ['神经网络', 'zh'],
    ['東京の天気', 'ja'],
    ['カタカナ', 'ja'],
    ['한국어 검색', 'ko'],
    ['погода', 'ru'],
    ['الطقس', 'ar'],
    ['how does this work', 'en'],
    ['bonjour', 'fr'],
    ['wie funktioniert das', 'de'],
    ['cómo funciona', 'es'],
    ['Rust', undefined],
    ['2026 + 123', undefined],
    ['the the the', undefined],
    ['hello bonjour', undefined],
  ])('detects %j as %s', (query, expected) => {
    expect(detectQueryLanguage(query)).toBe(expected)
  })
})

describe('search language precedence', () => {
  it.each([
    ['神经网络', 'en-US', 'de', 'fr', 'en-US'],
    ['神经网络', 'auto', 'de', 'fr', 'fr'],
    ['神经网络', 'auto', 'de', 'auto', 'zh-CN'],
    ['Rust', 'auto', 'de-DE', 'auto', 'de'],
    ['Rust', 'unsupported', 'fr', 'unsupported', 'fr'],
    ['Rust', 'PT-br', 'en', 'auto', 'pt_BR'],
    ['神经网络', 'all', 'de', 'fr', 'all'],
    ['神经网络', 'auto', 'de', 'all', 'all'],
    ['神经网络', 'en', 'de', 'all', 'en'],
    ['Rust', 'auto', '', 'auto', 'all'],
  ])('resolves query %j, manual %s, browser %s, default %s to %s', (query, manual, browser, configured, expected) => {
    expect(resolveSearchLanguage(query, manual, browser, supported, configured)).toBe(expected)
  })

  it('falls back to the browser when the detected query language is unavailable', () => {
    expect(
      resolveSearchLanguage(
        '神经网络',
        'auto',
        'fr',
        supported.filter(({ code }) => !code.startsWith('zh')),
        'auto',
      ),
    ).toBe('fr')
  })

  it('honors all without needing an advertised catalog entry', () => {
    expect(resolveSearchLanguage('神经网络', 'all', 'de', [], 'auto')).toBe('all')
    expect(resolveSearchLanguage('神经网络', 'auto', 'de', [], 'all')).toBe('all')
  })
})

describe('UI locale', () => {
  it.each([
    ['zh-Hant-HK,en;q=0.8', 'zh-TW'],
    ['zh-TW', 'zh-TW'],
    ['zh-Hans-SG', 'zh-CN'],
    ['zh', 'zh-CN'],
    ['de;q=0.9,fr;q=0.2', 'de'],
    ['ru,en-GB;q=0.8', 'en'],
    ['ja-JP', 'ja'],
    ['fr-CA', 'fr'],
    ['es-MX', 'es'],
    ['*', 'en'],
    ['', 'en'],
  ])('resolves %j independently of the search language to %s', (header, expected) => {
    expect(resolveUiLocale(header)).toBe(expected)
  })
})
