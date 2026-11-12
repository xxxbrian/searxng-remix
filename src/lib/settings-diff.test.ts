import { describe, expect, it } from 'vitest'
import { defaultSettings } from './settings'
import { describeChanges } from './settings-diff'

describe('describeChanges', () => {
  it('reports nothing for identical settings', () => {
    expect(describeChanges(defaultSettings(), defaultSettings())).toEqual([])
  })

  it('names changed fields, engines and host-list sizes without copying free text', () => {
    const before = defaultSettings()
    const after = structuredClone(before)
    after.safeSearch = 2
    after.ai.model = 'x/y'
    after.ai.instructions = 'Be terse. Secret sauce.'
    after.limits.searchPerMinute = 30
    after.engines = { bing: { enabled: false, weight: 2 } }
    after.blockedHosts = [...after.blockedHosts, 'new.example']
    const changes = describeChanges(before, after)
    expect(changes).toEqual(
      expect.arrayContaining([
        'safeSearch: 1 → 2',
        'ai.model: "" → x/y',
        '@edited:ai.instructions',
        'limits.searchPerMinute: 90 → 30',
        'engines.bing.enabled: — → false',
        'engines.bing.weight: 1 → 2',
        'blockedHosts: +1 −0',
      ]),
    )
    expect(changes.join()).not.toContain('Secret sauce')
  })
})
