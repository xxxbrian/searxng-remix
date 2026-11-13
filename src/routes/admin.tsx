import { createFileRoute, Link, useRouter } from '@tanstack/solid-router'
import { createSignal, For, Match, onCleanup, onMount, Show, Switch } from 'solid-js'
import { BehaviorSection } from '~/features/admin/behavior'
import { ClientOnly } from '~/features/admin/client-only'
import { adminText, useAdminText } from '~/features/admin/i18n'
import { ModelsSection } from '~/features/admin/models'
import { OverviewSection } from '~/features/admin/overview'
import { PolicySection } from '~/features/admin/policy'
import { parseSection, SECTIONS, type SectionId } from '~/features/admin/sections'
import { SourcesSection } from '~/features/admin/sources'
import { AdminContext, createAdminStore } from '~/features/admin/store'
import { SystemSection } from '~/features/admin/system'
import { UsageSection } from '~/features/admin/usage'
import { BRAND } from '~/lib/brand'
import { resolveUiLocale } from '~/lib/locale'
import type { AdminData } from '~/lib/settings'
import { adminLoginFn, adminLogoutFn, adminStateFn } from '~/server/admin.functions'
import '~/ui/admin.css'

export const Route = createFileRoute('/admin')({
  validateSearch: (raw: Record<string, unknown>): { section: SectionId } => ({ section: parseSection(raw.section) }),
  loader: () => adminStateFn(),
  staleTime: 0,
  head: ({ match }) => ({
    meta: [
      { title: `${adminText(resolveUiLocale(match.context.publicContext?.locale ?? 'en'), 'admin')} · ${BRAND}` },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminPage,
})

function AdminPage() {
  const state = Route.useLoaderData()
  return (
    <Show
      when={state().authenticated && ('data' in state() ? state().data : undefined)}
      fallback={<AdminLogin configured={state().configured} />}
      keyed
    >
      {data => <AdminWorkspace initial={data} />}
    </Show>
  )
}

function AdminLogin(props: { configured: boolean }) {
  const router = useRouter()
  const text = useAdminText()
  const { t } = text
  const [password, setPassword] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  return (
    <main class="admin-login">
      <h1>
        {BRAND.toUpperCase()}
        <b>.</b> {t('admin')}
      </h1>
      <Show when={props.configured} fallback={<p role="status">{t('setPassword')}</p>}>
        <form
          onSubmit={async e => {
            e.preventDefault()
            setBusy(true)
            setError('')
            try {
              await adminLoginFn({ data: { password: password() } })
              setPassword('')
              await router.invalidate()
            } catch (e) {
              setError(text.error(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          <label for="admin-password">{t('password')}</label>
          <input
            id="admin-password"
            type="password"
            autocomplete="current-password"
            required
            value={password()}
            onInput={e => setPassword(e.currentTarget.value)}
          />
          <Show when={error()}>
            <p class="error" role="alert">
              {error()}
            </p>
          </Show>
          <button type="submit" class="btn" disabled={busy()}>
            {busy() ? t('signingIn') : t('signIn')}
          </button>
        </form>
      </Show>
    </main>
  )
}

function AdminWorkspace(props: { initial: AdminData }) {
  const router = useRouter()
  const search = Route.useSearch()
  const { t } = useAdminText()
  const store = createAdminStore(props.initial)
  onMount(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (store.anyDirty()) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', guard)
    onCleanup(() => window.removeEventListener('beforeunload', guard))
  })
  return (
    <AdminContext.Provider value={store}>
      <div class="admin">
        <header class="admin-bar">
          <Link to="/" class="admin-brand">
            {BRAND.toUpperCase()}
            <b>.</b>
          </Link>
          <span class="muted">
            {t('admin')} · {t('revision', { revision: store.data().revision })}
          </span>
          <button
            type="button"
            class="btn btn-ghost"
            onClick={async () => {
              await adminLogoutFn()
              await router.invalidate()
            }}
          >
            {t('signOut')}
          </button>
        </header>
        <nav class="admin-nav" aria-label={t('sections')}>
          <For each={SECTIONS}>
            {s => (
              <Link
                to="/admin"
                search={{ section: s }}
                replace
                activeOptions={{ includeSearch: true }}
                activeProps={{ 'aria-current': 'page' }}
              >
                {t(`section_${s}`)}
              </Link>
            )}
          </For>
        </nav>
        <main class="admin-main" onInput={() => store.setNotice('')}>
          <Switch>
            <Match when={search().section === 'overview'}>
              <ClientOnly>
                <OverviewSection />
              </ClientOnly>
            </Match>
            <Match when={search().section === 'sources'}>
              <SourcesSection />
            </Match>
            <Match when={search().section === 'models'}>
              <ModelsSection />
            </Match>
            <Match when={search().section === 'behavior'}>
              <BehaviorSection />
            </Match>
            <Match when={search().section === 'policy'}>
              <PolicySection />
            </Match>
            <Match when={search().section === 'usage'}>
              <ClientOnly>
                <UsageSection />
              </ClientOnly>
            </Match>
            <Match when={search().section === 'system'}>
              <ClientOnly>
                <SystemSection />
              </ClientOnly>
            </Match>
          </Switch>
        </main>
      </div>
    </AdminContext.Provider>
  )
}
