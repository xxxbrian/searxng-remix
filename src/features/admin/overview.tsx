import { createQuery } from '@tanstack/solid-query'
import { For, Show } from 'solid-js'
import type { UsageKind } from '~/lib/settings'
import { systemInfoFn, usageReportFn } from '~/server/admin.functions'
import { VolumeBars } from './charts'
import { Panel } from './fields'
import { formatCount, formatMs, formatPercent } from './format'
import { useAdminText } from './i18n'
import { useAdmin } from './store'

function Stat(props: { label: string; value: string; note?: string; bad?: boolean }) {
  return (
    <div class="stat">
      <span class="muted">{props.label}</span>
      <strong classList={{ error: props.bad }}>{props.value}</strong>
      <small class="muted">{props.note ?? ' '}</small>
    </div>
  )
}

export function OverviewSection() {
  const admin = useAdmin()
  const text = useAdminText()
  const { t } = text
  const report = createQuery(() => ({
    queryKey: ['admin', 'usage', '24h'],
    queryFn: () => usageReportFn({ data: { range: '24h' } }),
    refetchInterval: 30_000,
  }))
  const system = createQuery(() => ({
    queryKey: ['admin', 'system'],
    queryFn: () => systemInfoFn(),
    refetchInterval: 30_000,
  }))
  const models = () => admin.data().models
  const state = (configured: boolean, on: boolean) => (!configured ? t('notConfigured') : on ? t('on') : t('off'))
  return (
    <>
      <Panel title={t('serviceStatus')}>
        <div class="stats">
          <Show when={system.isSuccess} fallback={<Stat label="SearXNG" value={t('checking')} />}>
            <Stat
              label="SearXNG"
              value={system.data!.searxng.ok ? t('online') : t('offline')}
              bad={!system.data!.searxng.ok}
              note={
                system.data!.searxng.ok
                  ? `${system.data!.searxng.ms} ms · ${t('enginesOn', { enabled: system.data!.searxng.enabledEngines ?? 0, total: system.data!.searxng.engines ?? 0 })}`
                  : text.status(system.data!.searxng.error ?? '')
              }
            />
          </Show>
          <Stat
            label={t('aiTitle')}
            value={state(models().ai.secret.source !== 'none', admin.draft().aiEnabled)}
            bad={models().ai.secret.source === 'none'}
            note={models().ai.model}
          />
          <Stat
            label="Jev"
            value={state(models().jev.secret.source !== 'none', admin.draft().jev.enabled)}
            bad={models().jev.secret.source === 'none'}
            note={models().jev.model}
          />
          <Stat
            label={t('settingsRevision')}
            value={String(admin.data().revision)}
            note={admin.data().updatedAt ? new Date(admin.data().updatedAt!).toLocaleString() : t('neverSaved')}
          />
        </div>
      </Panel>

      <Panel title={t('last24h')} aside={t('refreshes')}>
        <Show
          when={report.isSuccess}
          fallback={<p class="muted">{report.isError ? t('usageUnavailable') : t('loading')}</p>}
        >
          {(() => {
            const r = () => report.data!
            const kind = (k: UsageKind) => r().kinds.find(x => x.kind === k)!
            const tokens = () => r().kinds.reduce((sum, k) => sum + k.tokensIn + k.tokensOut, 0)
            return (
              <>
                <div class="stats">
                  <Stat
                    label={text.kind('search')}
                    value={formatCount(kind('search').count)}
                    note={t('cacheHits', { percent: formatPercent(kind('search').cached, kind('search').count) })}
                  />
                  <Stat
                    label={t('searchP95')}
                    value={formatMs(kind('search').p95)}
                    note={`P50 ${formatMs(kind('search').p50)}`}
                  />
                  <Stat
                    label={text.kind('summary')}
                    value={formatCount(kind('summary').count)}
                    note={`P95 ${formatMs(kind('summary').p95)}`}
                  />
                  <Stat label={t('tokens')} value={formatCount(tokens())} note={t('tokensNote')} />
                  <Stat
                    label={t('failures')}
                    value={formatCount(r().kinds.reduce((sum, k) => sum + k.errors, 0))}
                    bad={r().kinds.some(k => k.errors > 0)}
                    note={t('allKinds')}
                  />
                </div>
                <VolumeBars report={r()} />
                <div class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>{t('engine')}</th>
                        <th class="num">{t('requests')}</th>
                        <th class="num">{t('successRate')}</th>
                        <th class="num">{t('avgResults')}</th>
                        <th>{t('lastError')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For
                        each={r().engines}
                        fallback={
                          <tr>
                            <td colspan="5" class="muted">
                              {t('noEngineCalls')}
                            </td>
                          </tr>
                        }
                      >
                        {e => (
                          <tr>
                            <td class="mono">{e.engine}</td>
                            <td class="num">{e.calls}</td>
                            <td class="num" classList={{ error: e.failures / e.calls > 0.2 }}>
                              {formatPercent(e.calls - e.failures, e.calls)}
                            </td>
                            <td class="num">{(e.results / Math.max(1, e.calls - e.failures)).toFixed(1)}</td>
                            <td class="muted">{e.lastError ? text.status(e.lastError) : '—'}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}
        </Show>
      </Panel>
    </>
  )
}
