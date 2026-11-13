import { createMemo, createSignal, For, Show } from 'solid-js'
import type { EngineInfo, Settings } from '~/lib/settings'
import { Panel, SectionForm } from './fields'
import { useAdminText } from './i18n'
import { useAdmin } from './store'

export function SourcesSection() {
  const admin = useAdmin()
  const text = useAdminText()
  const { t } = text
  const [category, setCategory] = createSignal('general')
  const [query, setQuery] = createSignal('')
  const engines = () => admin.data().engines
  const categories = createMemo(() => [...new Set(engines().flatMap(e => e.categories))].sort())
  const filtered = createMemo(() =>
    engines().filter(
      e =>
        (category() === '*' || e.categories.includes(category())) &&
        e.name.toLowerCase().includes(query().toLowerCase()),
    ),
  )
  const enabled = (e: EngineInfo) => admin.draft().engines[e.name]?.enabled ?? e.enabled
  const weight = (e: EngineInfo) => admin.draft().engines[e.name]?.weight ?? 1
  const change = (engine: EngineInfo, next: Partial<Settings['engines'][string]>) =>
    admin.update('engines', {
      ...admin.draft().engines,
      [engine.name]: { enabled: enabled(engine), weight: weight(engine), ...next },
    })
  const status = (name: string) => {
    const h = admin.data().health[name]
    if (!h) return { text: t('noData'), failed: false }
    const failed = Boolean(h.error) && (!h.lastSuccessAt || h.lastFailureAt! >= h.lastSuccessAt)
    return { text: failed ? text.status(h.error!) : t('healthy'), failed }
  }

  return (
    <SectionForm keys={['engines']}>
      <Panel
        title={t('section_sources')}
        aside={t('enabledOf', { enabled: engines().filter(enabled).length, total: engines().length })}
      >
        <div class="toolbar">
          <select aria-label={t('category')} value={category()} onChange={e => setCategory(e.currentTarget.value)}>
            <option value="*">{t('allCategories')}</option>
            <For each={categories()}>{c => <option value={c}>{text.category(c)}</option>}</For>
          </select>
          <input
            type="search"
            aria-label={t('filterEngines')}
            placeholder={t('filterEngines')}
            value={query()}
            onInput={e => setQuery(e.currentTarget.value)}
          />
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{t('enabled')}</th>
                <th>{t('engine')}</th>
                <th>{t('capabilities')}</th>
                <th>{t('recentStatus')}</th>
                <th>{t('weight')}</th>
              </tr>
            </thead>
            <tbody>
              <For
                each={filtered()}
                fallback={
                  <tr>
                    <td colspan="5" class="muted">
                      {t('noMatch')}
                    </td>
                  </tr>
                }
              >
                {engine => (
                  <tr>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={t('enableEngine', { name: engine.name })}
                        checked={enabled(engine)}
                        onChange={e => change(engine, { enabled: e.currentTarget.checked })}
                      />
                    </td>
                    <td class="mono">{engine.name}</td>
                    <td class="muted">
                      {[
                        engine.paging && t('capPaging'),
                        engine.languageSupport && t('capLanguage'),
                        engine.timeRangeSupport && t('capTime'),
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                    <td classList={{ error: status(engine.name).failed, muted: !status(engine.name).failed }}>
                      {status(engine.name).text}
                    </td>
                    <td>
                      <select
                        aria-label={t('engineWeight', { name: engine.name })}
                        value={weight(engine)}
                        onChange={e => change(engine, { weight: Number(e.currentTarget.value) })}
                      >
                        <For each={[0.5, 1, 1.5, 2, 3, 5]}>
                          {n => <option value={n}>{n === 1 ? t('normal') : `${n}×`}</option>}
                        </For>
                      </select>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <Show when={engines().length === 0}>
          <p class="muted">{t('noCatalog')}</p>
        </Show>
      </Panel>
    </SectionForm>
  )
}
