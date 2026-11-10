import { type QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/solid-router'
import type { JSX } from 'solid-js'
import { HydrationScript } from 'solid-js/web'
import { BRAND } from '~/lib/brand'
import { I18nProvider } from '~/lib/i18n'
import { resolveUiLocale } from '~/lib/locale'
import { getPublicContextFn } from '~/server/functions'
import appCss from '~/ui/styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async () => ({ publicContext: await getPublicContextFn() }),
  head: () => ({
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'theme-color', content: '#e3000f' },
      { title: BRAND },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      {
        rel: 'search',
        type: 'application/opensearchdescription+xml',
        title: BRAND,
        href: '/opensearch.xml',
      },
    ],
  }),
  component: RootLayout,
  shellComponent: RootDocument,
})

function RootLayout() {
  const context = Route.useRouteContext()
  return (
    <QueryClientProvider client={context().queryClient}>
      <Outlet />
    </QueryClientProvider>
  )
}

function RootDocument(props: { children: JSX.Element }) {
  const context = Route.useRouteContext()
  return (
    <I18nProvider publicContext={context().publicContext}>
      <html lang={resolveUiLocale(context().publicContext?.locale ?? 'en')}>
        <head>
          <HydrationScript />
          <HeadContent />
        </head>
        <body>
          {props.children}
          <Scripts />
        </body>
      </html>
    </I18nProvider>
  )
}
