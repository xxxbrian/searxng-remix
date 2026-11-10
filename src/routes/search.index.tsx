import { Await, createFileRoute, defer, Link, useRouter } from '@tanstack/solid-router'
import { For, Match, Show, Switch } from 'solid-js'
import { AiSummary } from '~/features/ai-summary'
import { LiveCardView } from '~/features/live-cards'
import { Pager } from '~/features/navigation'
import { AnswerCard, ImageGrid, KnowledgePanel, VideoGrid, WebHit } from '~/features/results'
import { ResultsSkeleton } from '~/features/status-views'
import { useI18n } from '~/lib/i18n'
import { type LiveCard, liveRequest } from '~/lib/live'
import {
  canAutoSummarize,
  FALLBACK_DECISION,
  instantAnswer,
  type SearchDecision,
  showKnowledge,
} from '~/lib/search-decision'
import { DEFAULT_SEARCH } from '~/lib/search-params'
import type { SearchPage } from '~/lib/types'
import { classifyQueryFn, liveCardFn, searchFn } from '~/server/functions'

/** Results are critical; intent decisions and live cards stream independently into their own boundaries. */
export const Route = createFileRoute('/search/')({
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const decision =
      deps.tab === 'all' && deps.page === 1
        ? classifyQueryFn({ data: { q: deps.q } }).catch(() => FALLBACK_DECISION)
        : Promise.resolve(FALLBACK_DECISION)
    // Live data follows the decision but never holds back the decision itself.
    const live = decision.then((d): Promise<LiveCard | null> => {
      const request = liveRequest(deps.q, d)
      return request ? liveCardFn({ data: { q: deps.q, kind: request.kind } }).catch(() => null) : Promise.resolve(null)
    })
    return { ...(await searchFn({ data: deps })), decision: defer(decision), live: defer(live) }
  },
  staleTime: 0,
  pendingMs: 120,
  pendingComponent: SearchPending,
  component: SearchResults,
})

function SearchPending() {
  const i18n = useI18n()
  return (
    <main class="rbody" aria-label={i18n.t('results')} aria-busy="true">
      <ResultsSkeleton />
    </main>
  )
}

function SearchResults() {
  const i18n = useI18n()
  const router = useRouter()
  const search = Route.useSearch()
  const data = Route.useLoaderData()
  const emptyTitle = () => {
    if (data().degraded) return i18n.t(data().page > 1 ? 'pageUnavailable' : 'unavailable')
    return data().page > 1 ? i18n.t('noMore') : i18n.t('noResults', { query: data().query })
  }
  const isWeb = () => data().tab !== 'images' && data().tab !== 'videos'
  const isFirstWebPage = () => data().tab === 'all' && data().page === 1

  return (
    <main class="rbody" aria-label={i18n.t('results')}>
      <p class="meta">
        {i18n.t('resultMeta', {
          page: data().page,
          seconds: (data().elapsedMs / 1000).toLocaleString(i18n.locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
        })}
      </p>
      <Show when={data().correction}>
        {fixed => (
          <p class="correction">
            {i18n.t('correction')}{' '}
            <Link from="/search" to="/search" search={p => ({ ...p, q: fixed(), page: 1 })}>
              {fixed()}
            </Link>
          </p>
        )}
      </Show>

      <Show when={isFirstWebPage() && data()} keyed>
        {page => (
          <>
            <Await promise={page.live} fallback={null}>
              {card => <Show when={card}>{c => <LiveCardView card={c()} locale={i18n.locale} />}</Show>}
            </Await>
            <Await promise={page.decision} fallback={null}>
              {decision => (
                <Show when={instantAnswer(page, decision)}>
                  {answer => <AnswerCard answers={[answer()]} locale={i18n.locale} />}
                </Show>
              )}
            </Await>
            <aside class="result-rail">
              <Await
                promise={page.decision}
                fallback={i18n.aiEnabled && page.hits.length > 0 ? <SummaryPending /> : null}
              >
                {decision => <SearchRail page={page} decision={decision} />}
              </Await>
            </aside>
          </>
        )}
      </Show>

      <Switch>
        <Match when={data().hits.length === 0}>
          <section class="empty">
            <h2 class="empty-title">{emptyTitle()}</h2>
            <Show
              when={data().degraded}
              fallback={<p>{i18n.t(data().page > 1 ? 'previousResults' : 'tryDifferent')}</p>}
            >
              <p>{i18n.t('sourcesUnavailable')}</p>
              <div class="status-actions">
                <button type="button" class="btn" onClick={() => void router.invalidate()}>
                  {i18n.t('reload')}
                </button>
              </div>
            </Show>
          </section>
        </Match>
        <Match when={data().tab === 'images'}>
          <ImageGrid hits={data().hits} locale={i18n.locale} />
        </Match>
        <Match when={data().tab === 'videos'}>
          <VideoGrid hits={data().hits} locale={i18n.locale} />
        </Match>
        <Match when={isWeb()}>
          <div class="hits">
            <For each={data().hits}>{hit => <WebHit hit={hit} locale={i18n.locale} />}</For>
          </div>
        </Match>
      </Switch>

      <Show when={data().suggestions.length > 0 && isFirstWebPage()}>
        <section class="related" aria-labelledby="related-title">
          <h2 id="related-title" class="label">
            {i18n.t('related')}
          </h2>
          <ul>
            <For each={data().suggestions}>
              {s => (
                <li>
                  <Link
                    from="/search"
                    to="/search"
                    search={{ ...DEFAULT_SEARCH, q: s, lang: search().lang }}
                    class="chip"
                  >
                    {s}
                  </Link>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
      <Show when={data().hits.length > 0 || data().page > 1}>
        <Pager page={data().page} hasNext={data().hits.length > 0} />
      </Show>
    </main>
  )
}

function SearchRail(props: { page: SearchPage; decision: SearchDecision }) {
  const i18n = useI18n()
  return (
    <>
      <Show when={i18n.aiEnabled && props.page.hits.length > 0 && props.decision.summary !== 'off'}>
        <AiSummary
          query={props.page.query}
          lang={props.page.language}
          auto={i18n.aiAuto && props.decision.summary === 'auto' && canAutoSummarize(props.page)}
        />
      </Show>
      <Show when={showKnowledge(props.decision) && props.page.infobox}>
        {box => <KnowledgePanel box={box()} locale={i18n.locale} />}
      </Show>
    </>
  )
}

function SummaryPending() {
  const i18n = useI18n()
  return (
    <section class="ai" aria-busy="true" aria-label={i18n.t('aiTitle')}>
      <h2 class="label">{i18n.t('aiTitle')}</h2>
      <div class="skeleton rail-skeleton">
        <span class="skeleton-line" />
        <span class="skeleton-line" style={{ width: '72%' }} />
      </div>
    </section>
  )
}
