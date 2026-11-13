import { describe, expect, it } from 'vitest'
import { ERROR_CODES } from '~/lib/errors'
import { adminDictionaries, adminText, en } from './messages'

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

describe('admin messages', () => {
  it('uses the same placeholders in every locale', () => {
    for (const [locale, dictionary] of Object.entries(adminDictionaries)) {
      for (const [key, text] of Object.entries(en)) {
        expect(placeholders(dictionary[key as keyof typeof en]), `${locale}.${key}`).toEqual(placeholders(text))
      }
    }
  })

  it('has wording for every error code and no empty strings', () => {
    for (const dictionary of Object.values(adminDictionaries)) {
      for (const code of ERROR_CODES) expect(dictionary[`err_${code}`]).toBeTruthy()
      expect(Object.values(dictionary).every(text => text.trim().length > 0)).toBe(true)
    }
  })

  it('fills values', () => {
    expect(adminText('en', 'restoreAsk', { revision: 7 })).toBe('Restore the settings from before revision 7?')
    expect(adminText('zh-CN', 'enabledOf', { enabled: 3, total: 9 })).toBe('已启用 3 / 9')
  })
})
