import { createFileRoute } from '@tanstack/solid-router'
import { BRAND } from '~/lib/brand'

/** Lets browsers offer this site as a search engine ("Add as default search"). */
export const Route = createFileRoute('/opensearch.xml')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = new URL(request.url).origin
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>${BRAND}</ShortName>
  <Description>Search with ${BRAND}</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image width="32" height="32" type="image/svg+xml">${origin}/favicon.svg</Image>
  <Url type="text/html" method="get" template="${origin}/search?q={searchTerms}"/>
  <Url type="application/x-suggestions+json" method="get" template="${origin}/api/suggest?q={searchTerms}"/>
</OpenSearchDescription>`
        return new Response(xml, {
          headers: {
            'content-type': 'application/opensearchdescription+xml; charset=utf-8',
            'cache-control': 'public, max-age=86400',
          },
        })
      },
    },
  },
})
