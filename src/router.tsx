import { QueryClient } from '@tanstack/solid-query'
import { createRouter } from '@tanstack/solid-router'
import { ErrorView, NotFoundView } from '~/features/status-views'
import { routeTree } from './routeTree.gen'

/** Called once per request on the server and once in the browser. */
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  })

  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 30_000,
    defaultErrorComponent: ErrorView,
    defaultNotFoundComponent: NotFoundView,
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
