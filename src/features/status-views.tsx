import { type ErrorComponentProps, Link, useRouter } from '@tanstack/solid-router'
import { BRAND } from '~/lib/brand'
import { useI18n } from '~/lib/i18n'

export function ErrorView(props: ErrorComponentProps) {
  const router = useRouter()
  const i18n = useI18n()
  // The page shows a generic message; keep the cause visible while developing.
  if (import.meta.env.DEV) console.error(props.error)
  return (
    <main class="status">
      <p class="eyebrow">{i18n.t('error')}</p>
      <h1 class="status-title">{i18n.t('errorTitle')}</h1>
      <p class="status-body">{i18n.t('errorBody')}</p>
      <div class="status-actions">
        <button
          type="button"
          class="btn"
          onClick={() => {
            props.reset()
            void router.invalidate()
          }}
        >
          {i18n.t('retry')}
        </button>
        <Link to="/" class="btn btn-ghost">
          {i18n.t('backHome', { brand: BRAND })}
        </Link>
      </div>
    </main>
  )
}

export function NotFoundView() {
  const i18n = useI18n()
  return (
    <main class="status">
      <p class="eyebrow">404</p>
      <h1 class="status-title">{i18n.t('notFound')}</h1>
      <div class="status-actions">
        <Link to="/" class="btn">
          {i18n.t('backHome', { brand: BRAND })}
        </Link>
      </div>
    </main>
  )
}

export function ResultsSkeleton() {
  const i18n = useI18n()
  return (
    <div class="skeleton" role="status" aria-busy="true" aria-label={i18n.t('searching')}>
      {Array.from({ length: 5 }, () => (
        <div class="skeleton-item">
          <span class="skeleton-line" style={{ width: '30%' }} />
          <span class="skeleton-line skeleton-title" style={{ width: '80%' }} />
          <span class="skeleton-line" style={{ width: '95%' }} />
          <span class="skeleton-line" style={{ width: '60%' }} />
        </div>
      ))}
    </div>
  )
}
