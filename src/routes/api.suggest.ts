import { createFileRoute } from '@tanstack/solid-router'
import { suggest } from '~/server/searxng.server'

/** OpenSearch suggestions: lets browsers show completions in the address bar. */
export const Route = createFileRoute('/api/suggest')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams.get('q')?.trim().slice(0, 100) ?? ''
        const list = q ? await suggest(q).catch(() => []) : []
        return Response.json([q, list], {
          headers: {
            'content-type': 'application/x-suggestions+json; charset=utf-8',
            'cache-control': 'public, max-age=300',
          },
        })
      },
    },
  },
})
