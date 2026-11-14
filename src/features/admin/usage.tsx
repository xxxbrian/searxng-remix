import { createQuery } from '@tanstack/solid-query'
import { createSignal, For, Show } from 'solid-js'
import type { UsageEvent, UsageKind } from '~/lib/settings'
import { usageEventsFn, usageReportFn } from '~/server/admin.functions'
import { VolumeBars } from './charts'
import { Check, NumberField, Panel, SectionForm } from './fields'
import { formatCount, formatMs, formatPercent, formatTime, USAGE_KINDS } from './format'
import { useAdminText } from './i18n'
import { useAdmin } from './store'

type Range = '24h' | '7d' | '30d'

function Events() {
  const text = useAdminText()
  const { t } = text
  const [kind, setKind] = createSignal<UsageKind | ''>('')
  const [failedOnly, setFailedOnly] = createSignal(false)
  const [extra, setExtra] = createSignal<UsageEvent[]>([])
  const [loading, setLoading] = createSignal(false)
  const filter = () => ({ kind: kind() || undefined, failedOnly: failedOnly() || undefined })
  const first = createQuery(() => ({
    queryKey: ['admin', 'events', kind(), failedOnly()],
    queryFn: () => usageEventsFn({ data: filter() }),
    refetchInterval: 15_000,
  }))
  const rows = () => (first.isSuccess ? [...first.data!, ...extra()] : [])
  const more = async () => {
    const last = rows().at(-1)
    if (!last) return
    setLoading(true)
    try {
      setExtra([...extra(), ...(await usageEventsFn({ data: { ...filter(), before: last.id } }))])
    } finally {
      setLoading(false)
    }
  }
  const reset = () => setExtra([])
  const notes = (e: UsageEvent) =>
    !e.ok
      ? e.error
        ? text.status(e.error)
        : t('testFailed')
      : [
          e.cached ? t('cached') : '',
          e.tokensIn != null ? `${e.tokensIn}→${e.tokensOut} tok` : '',
          e.detail?.intent ? String(e.detail.intent) : '',
          e.detail?.degraded ? t('partialEngines') : '',
        ]
          .filter(Boolean)
          .join(' · ') || '—'
  return (
    <Panel title={t('recentRequests')} aside={t('recentHint')}>
      <div class="toolbar toolbar-events">
        <select
          aria-label={t('type')}
          value={kind()}
          onChange={e => {
            reset()
            setKind(e.currentTarget.value as UsageKind | '')
          }}
        >
          <option value="">{t('allTypes')}</option>
          <For each={USAGE_KINDS}>{value => <option value={value}>{text.kind(value)}</option>}</For>
        </select>
        <Check
          label={t('failedOnly')}
          checked={failedOnly()}
          onChange={v => {
            reset()
            setFailedOnly(v)
          }}
        />
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>{t('time')}</th>
              <th>{t('type')}</th>
              <th>{t('query')}</th>
              <th class="num">{t('duration')}</th>
              <th class="num">{t('results')}</th>
              <th>{t('notes')}</th>
            </tr>
          </thead>
          <tbody>
            <For
              each={rows()}
              fallback={
                <tr>
                  <td colspan="6" class="muted">
                    {first.isSuccess ? t('noRecords') : t('loading')}
                  </td>
                </tr>
              }
            >
              {e => (
                <tr>
                  <td class="muted">{formatTime(e.ts)}</td>
                  <td>{text.kind(e.kind)}</td>
                  <td class="cell-query" title={e.query ?? ''}>
                    {e.query ?? <span class="muted">—</span>}
                  </td>
                  <td class="num">{formatMs(e.ms)}</td>
                  <td class="num">{e.results ?? '—'}</td>
                  <td classList={{ error: !e.ok, muted: e.ok }}>{notes(e)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <Show when={first.isSuccess && rows().length >= 50 && rows().length % 50 === 0}>
        <button type="button" class="btn btn-ghost" disabled={loading()} onClick={more}>
          {loading() ? t('loading') : t('more')}
        </button>
      </Show>
    </Panel>
  )
}

function CountTable(props: { title: string; rows: Array<{ label: string; count: number }>; query?: boolean }) {
  const { t } = useAdminText()
  return (
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>{props.title}</th>
            <th class="num">{t('count')}</th>
          </tr>
        </thead>
        <tbody>
          <For
            each={props.rows}
            fallback={
              <tr>
                <td colspan="2" class="muted">
                  {t('noRecords')}
                </td>
              </tr>
            }
          >
            {row => (
              <tr>
                <td classList={{ 'cell-query': props.query }}>{row.label}</td>
                <td class="num">{row.count}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  )
}

export function UsageSection() {
  const admin = useAdmin()
  const text = useAdminText()
  const { t } = text
  const usage = () => admin.draft().usage
  const [range, setRange] = createSignal<Range>('24h')
  const report = createQuery(() => ({
    queryKey: ['admin', 'usage', range()],
    queryFn: () => usageReportFn({ data: { range: range() } }),
    refetchInterval: 30_000,
  }))
  return (
    <>
      <Panel
        title={t('statistics')}
        aside={
          <select aria-label={t('range')} value={range()} onChange={e => setRange(e.currentTarget.value as Range)}>
            <option value="24h">{t('range24h')}</option>
            <option value="7d">{t('range7d')}</option>
            <option value="30d">{t('range30d')}</option>
          </select>
        }
      >
        <Show
          when={report.isSuccess}
          fallback={<p class="muted">{report.isError ? t('usageUnavailable') : t('loading')}</p>}
        >
          <VolumeBars report={report.data!} />
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>{t('type')}</th>
                  <th class="num">{t('count')}</th>
                  <th class="num">{t('failures')}</th>
                  <th class="num">{t('cache')}</th>
                  <th class="num">P50</th>
                  <th class="num">P95</th>
                  <th class="num">{t('tokensIn')}</th>
                  <th class="num">{t('tokensOut')}</th>
                </tr>
              </thead>
              <tbody>
                <For each={report.data!.kinds}>
                  {k => (
                    <tr>
                      <td>{text.kind(k.kind)}</td>
                      <td class="num">{formatCount(k.count)}</td>
                      <td class="num" classList={{ error: k.errors > 0 }}>
                        {k.errors}
                      </td>
                      <td class="num">{k.kind === 'suggest' ? '—' : formatPercent(k.cached, k.count)}</td>
                      <td class="num">{k.count ? formatMs(k.p50) : '—'}</td>
                      <td class="num">{k.count ? formatMs(k.p95) : '—'}</td>
                      <td class="num">{k.tokensIn ? formatCount(k.tokensIn) : '—'}</td>
                      <td class="num">{k.tokensOut ? formatCount(k.tokensOut) : '—'}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <div class="columns">
            <CountTable
              title={t('topQueries')}
              query
              rows={report.data!.topQueries.map(q => ({ label: q.query, count: q.count }))}
            />
            <CountTable
              title={t('zeroResults')}
              query
              rows={report.data!.zeroResultQueries.map(q => ({ label: q.query, count: q.count }))}
            />
            <CountTable
              title={t('intents')}
              rows={report.data!.intents.map(i => ({ label: i.intent, count: i.count }))}
            />
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>{t('engine')}</th>
                  <th class="num">{t('requests')}</th>
                  <th class="num">{t('failures')}</th>
                  <th class="num">{t('successRate')}</th>
                  <th class="num">{t('totalResults')}</th>
                  <th>{t('lastError')}</th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={report.data!.engines}
                  fallback={
                    <tr>
                      <td colspan="6" class="muted">
                        {t('noRecords')}
                      </td>
                    </tr>
                  }
                >
                  {e => (
                    <tr>
                      <td class="mono">{e.engine}</td>
                      <td class="num">{e.calls}</td>
                      <td class="num" classList={{ error: e.failures > 0 }}>
                        {e.failures}
                      </td>
                      <td class="num">{formatPercent(e.calls - e.failures, e.calls)}</td>
                      <td class="num">{e.results}</td>
                      <td class="muted">{e.lastError ? text.status(e.lastError) : '—'}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Panel>

      <Events />

      <SectionForm keys={['usage']}>
        <Panel title={t('recording')}>
          <Check
            label={t('recordUsage')}
            checked={usage().enabled}
            onChange={enabled => admin.patch('usage', { enabled })}
          />
          <Check
            label={t('recordQueries')}
            checked={usage().recordQueries}
            disabled={!usage().enabled}
            onChange={recordQueries => admin.patch('usage', { recordQueries })}
          />
          <div class="grid">
            <NumberField
              label={t('retentionDays')}
              hint={t('retentionHint')}
              min={1}
              max={3650}
              value={usage().retentionDays}
              onChange={retentionDays => admin.patch('usage', { retentionDays })}
            />
          </div>
          <p class="muted">{t('usageNote')}</p>
        </Panel>
      </SectionForm>
    </>
  )
}
