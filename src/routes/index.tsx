import { createFileRoute } from '@tanstack/solid-router'
import { SearchBox } from '~/features/search-box'
import { BRAND } from '~/lib/brand'
import { useI18n } from '~/lib/i18n'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: BRAND }] }),
  component: Home,
})

function Home() {
  const i18n = useI18n()
  return (
    <main class="home">
      <h1 class="wordmark">
        {BRAND.toUpperCase()}
        <b>.</b>
      </h1>
      <SearchBox variant="hero" />
      <p class="hint">
        {i18n.t('focusHint')} <kbd>/</kbd> {i18n.t('searchHint')} <kbd>Enter</kbd> {i18n.t('submitHint')}
      </p>
    </main>
  )
}
