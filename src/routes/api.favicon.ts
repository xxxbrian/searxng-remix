import { createFileRoute } from '@tanstack/solid-router'

const HOST = /^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i
const ONE_WEEK = 7 * 24 * 60 * 60

/**
 * Proxies site icons so browsers never contact a third party about what was
 * searched. The upstream host is fixed and the host param is validated.
 */
export const Route = createFileRoute('/api/favicon')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const host = new URL(request.url).searchParams.get('host') ?? ''
        if (!HOST.test(host)) return new Response(null, { status: 400 })

        const upstream = await fetch(`https://icons.duckduckgo.com/ip3/${host}.ico`, {
          signal: AbortSignal.timeout(4_000),
        }).catch(() => undefined)
        if (!upstream?.ok) {
          return new Response(null, { status: 404, headers: { 'cache-control': `public, max-age=${3600}` } })
        }
        return new Response(upstream.body, {
          headers: {
            'content-type': upstream.headers.get('content-type') ?? 'image/x-icon',
            'cache-control': `public, max-age=${ONE_WEEK}, immutable`,
          },
        })
      },
    },
  },
})
