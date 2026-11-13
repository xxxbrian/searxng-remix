import { For } from 'solid-js'
import { Panel, SectionForm } from './fields'
import { useAdminText } from './i18n'
import { useAdmin } from './store'

const LISTS = [
  { key: 'blockedHosts', title: 'blocked', note: 'blockedNote' },
  { key: 'demotedHosts', title: 'demoted', note: 'demotedNote' },
  { key: 'trustedHosts', title: 'trusted', note: 'trustedNote' },
] as const

export function PolicySection() {
  const admin = useAdmin()
  const { t } = useAdminText()
  return (
    <SectionForm keys={['blockedHosts', 'demotedHosts', 'trustedHosts']}>
      <Panel title={t('section_policy')} aside={t('policyHint')}>
        <div class="columns">
          <For each={LISTS}>
            {item => (
              <label class="field">
                <span class="field-label">
                  {t(item.title)}{' '}
                  <span class="muted">
                    {admin.draft()[item.key].length} · {t(item.note)}
                  </span>
                </span>
                <textarea
                  rows="14"
                  spellcheck={false}
                  value={admin.draft()[item.key].join('\n')}
                  onInput={e => admin.update(item.key, e.currentTarget.value.split('\n'))}
                  onBlur={() =>
                    admin.update(item.key, [
                      ...new Set(
                        admin
                          .draft()
                          [item.key].map(s => s.trim())
                          .filter(Boolean),
                      ),
                    ])
                  }
                />
              </label>
            )}
          </For>
        </div>
      </Panel>
    </SectionForm>
  )
}
