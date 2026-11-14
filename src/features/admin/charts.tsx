import { createMemo, For } from 'solid-js'
import type { UsageReport } from '~/lib/settings'
import { useAdminText } from './i18n'

/** Request volume per bucket; the red cap marks failed requests. Gaps are filled with empty buckets. */
export function VolumeBars(props: { report: UsageReport }) {
  const { t } = useAdminText()
  const buckets = createMemo(() => {
    const { since, bucketMs, series } = props.report
    const byTs = new Map(series.map(point => [point.ts, point]))
    const first = Math.floor(since / bucketMs) * bucketMs
    const last = Math.floor(Date.now() / bucketMs) * bucketMs
    const list = []
    for (let ts = first; ts <= last; ts += bucketMs) list.push(byTs.get(ts) ?? { ts, search: 0, summary: 0, errors: 0 })
    return list
  })
  const peak = createMemo(() => Math.max(1, ...buckets().map(b => b.search + b.summary)))
  return (
    <div class="bars" role="img" aria-label={t('requestVolume')}>
      <For each={buckets()}>
        {b => (
          <span
            class="bar"
            title={t('volumeTip', {
              time: new Date(b.ts).toLocaleString(),
              search: b.search,
              summary: b.summary,
              errors: b.errors,
            })}
          >
            <i style={{ height: `${((b.search + b.summary) / peak()) * 100}%` }} />
            {b.errors > 0 && <u style={{ height: `${Math.max(2, (b.errors / peak()) * 100)}%` }} />}
          </span>
        )}
      </For>
    </div>
  )
}
