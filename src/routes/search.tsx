import { createFileRoute, Link, Outlet, redirect, stripSearchParams } from '@tanstack/solid-router'
import { Tabs, Tools } from '~/features/navigation'
import { SearchBox } from '~/features/search-box'
import { BRAND } from '~/lib/brand'
import { useI18n } from '~/lib/i18n'
import { DEFAULT_SEARCH, parseSearchParams } from '~/lib/search-params'

/** Persistent search chrome. Only the child route waits for search results. */
export const Route = createFileRoute('/search')({
  validateSearch: (raw: Record<string, unknown>) => parseSearchParams(raw),
  search: {
    middlewares: [
      stripSearchParams({
        tab: DEFAULT_SEARCH.tab,
        page: DEFAULT_SEARCH.page,
        time: DEFAULT_SEARCH.time,
        lang: DEFAULT_SEARCH.lang,
      }),
    ],
  },
  beforeLoad: ({ search }) => {
    if (!search.q) throw redirect({ to: '/' })
  },
  head: ({ match }) => ({
    meta: [{ title: `${match.search.q} - ${BRAND}` }, { name: 'robots', content: 'noindex' }],
  }),
  component: SearchLayout,
})

function SearchLayout() {
  const i18n = useI18n()
  const search = Route.useSearch()

  return (
    <>
      <header class="rh">
        <div class="rh-bar">
          <Link to="/" class="rh-logo" aria-label={`${BRAND} ${i18n.t('home')}`}>
            {BRAND.charAt(0).toUpperCase()}
            <b>.</b>
          </Link>
          <SearchBox variant="compact" initial={search().q} tab={search().tab} lang={search().lang} />
        </div>
        <Tabs current={search().tab} />
      </header>

      <Tools time={search().time} lang={search().lang} />
      <Outlet />
    </>
  )
}
