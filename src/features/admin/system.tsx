import { createQuery, useQueryClient } from '@tanstack/solid-query'
import { createSignal, For, Show } from 'solid-js'
import { clearUsageFn, systemInfoFn } from '~/server/admin.functions'
import { Panel } from './fields'
import { formatCount } from './format'
import { useAdminText } from './i18n'
import { useAdmin } from './store'

function Confirm(props: { label: string; message: string; onConfirm: () => Promise<void> }) {
  const { t } = useAdminText()
  const [asking, setAsking] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  return (
    <Show
      when={asking()}
      fallback={
        <button type="button" class="btn btn-ghost" onClick={() => setAsking(true)}>
          {props.label}
        </button>
      }
    >
      <span class="inline confirm">
        <span>{props.message}</span>
        <button
          type="button"
          class="btn"
          disabled={busy()}
          onClick={async () => {
            setBusy(true)
            try {
              await props.onConfirm()
            } finally {
              setBusy(false)
              setAsking(false)
            }
          }}
        >
          {t('confirm')}
        </button>
        <button type="button" class="btn btn-ghost" onClick={() => setAsking(false)}>
          {t('cancel')}
        </button>
      </span>
    </Show>
  )
}

export function SystemSection() {
  const admin = useAdmin()
  const text = useAdminText()
  const { t } = text
  const queries = useQueryClient()
  const system = createQuery(() => ({ queryKey: ['admin', 'system'], queryFn: () => systemInfoFn() }))
  const refresh = () => queries.invalidateQueries({ queryKey: ['admin'] })
  return (
    <>
      <Panel title="SearXNG" aside={t('searxngHint')}>
        <Show
          when={system.isSuccess}
          fallback={<p class="muted">{system.isError ? t('systemUnavailable') : t('checking')}</p>}
        >
          {(() => {
            const s = () => system.data!.searxng
            const rows = (): Array<[string, string, boolean?]> => [
              [t('address'), s().url],
              [
                t('status'),
                s().ok ? t('onlineMs', { ms: s().ms }) : t('offlineBecause', { error: text.status(s().error ?? '') }),
                !s().ok,
              ],
              [t('version'), s().version ?? '—'],
              [t('instance'), s().instance ?? '—'],
              [
                t('engines'),
                s().ok ? t('enginesTotal', { enabled: s().enabledEngines ?? 0, total: s().engines ?? 0 }) : '—',
              ],
              [t('defaultSafeSearch'), s().safeSearch === undefined ? '—' : String(s().safeSearch)],
              [t('plugins'), s().plugins?.join(', ') || '—'],
            ]
            return (
              <dl class="kv">
                <For each={rows()}>
                  {([k, v, bad]) => (
                    <>
                      <dt class="muted">{k}</dt>
                      <dd classList={{ error: bad }}>{v}</dd>
                    </>
                  )}
                </For>
              </dl>
            )
          })()}
        </Show>
      </Panel>

      <Panel title={t('runtime')}>
        <Show when={system.isSuccess}>
          <dl class="kv">
            <dt class="muted">Node</dt>
            <dd>{system.data!.node}</dd>
            <dt class="muted">{t('uptime')}</dt>
            <dd>{text.uptime(system.data!.uptimeSec)}</dd>
            <dt class="muted">{t('dataDir')}</dt>
            <dd class="mono">{system.data!.dataDir}</dd>
            <dt class="muted">{t('usageRecords')}</dt>
            <dd>
              {system.data!.usage.oldest
                ? t('recordCountSince', {
                    count: formatCount(system.data!.usage.events),
                    date: new Date(system.data!.usage.oldest).toLocaleDateString(),
                  })
                : t('recordCount', { count: formatCount(system.data!.usage.events) })}
            </dd>
          </dl>
        </Show>
      </Panel>

      <Panel title={t('history')} aside={t('historyHint')}>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{t('version')}</th>
                <th>{t('time')}</th>
                <th>{t('changes')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <For
                each={system.isSuccess ? system.data!.history : []}
                fallback={
                  <tr>
                    <td colspan="4" class="muted">
                      {system.isSuccess ? t('noHistory') : t('loading')}
                    </td>
                  </tr>
                }
              >
                {h => (
                  <tr>
                    <td class="num">{h.revision}</td>
                    <td class="muted">{new Date(h.at).toLocaleString()}</td>
                    <td class="cell-wrap">{h.changes.map(text.change).join('; ') || t('noFieldChanges')}</td>
                    <td>
                      <Confirm
                        label={t('restoreBefore')}
                        message={t('restoreAsk', { revision: h.revision })}
                        onConfirm={async () => {
                          await admin.restore(h.revision)
                          await refresh()
                        }}
                      />
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={t('maintenance')}>
        <div class="actions">
          <Confirm
            label={t('resetDefaults')}
            message={t('resetAsk')}
            onConfirm={async () => {
              await admin.reset()
              await refresh()
            }}
          />
          <Confirm
            label={t('clearUsage')}
            message={t('clearAsk')}
            onConfirm={async () => {
              await clearUsageFn()
              await refresh()
            }}
          />
        </div>
        <Show when={admin.error() && admin.scope() === 'reset'}>
          <p class="error">{admin.error()}</p>
        </Show>
      </Panel>
    </>
  )
}
