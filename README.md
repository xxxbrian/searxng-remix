# SearXNG Remix

English | [简体中文](README.zh-CN.md)

A fast, polished front end for [SearXNG](https://github.com/searxng/searxng), the privacy-respecting metasearch engine. It keeps SearXNG's breadth and independence and adds what you expect from a modern search page: AI summaries with citations, intent-aware answers, live weather and local-time cards, rich image and video results, and an admin console for running the instance.

Built with SolidJS, TanStack Start, TypeScript and Vite. Everything that talks to SearXNG or an AI provider runs on the server; browsers never see upstream keys or contact third parties about what was searched.

## Features

**Search**

- Server-rendered results that stream in fast, with tabs for web, images, videos, news, science and development.
- Image grid with an accessible preview, video cards with duration, author and date, and site icons proxied through the server.
- Time and language filters. The search language follows the query text, then the browser, unless you pick one.
- Instant answers and knowledge panels from SearXNG, plus per-site blocking, demoting and boosting.
- OpenSearch support, so browsers can add the site as a search engine with address-bar suggestions.

**AI, used where it helps**

- **AI summaries** from any OpenAI-compatible endpoint, grounded in the top results and citing them. They appear on demand, or automatically for explanation, comparison and how-to queries when the sources are good enough.
- **Intent detection** runs alongside the search and decides what kind of query it is: navigation, fact, explanation, weather and so on. It uses the System One decision API, with TypeSafe's [Jev](https://docs.typesafe.ai) as the default model; Ollama and several gateways serve the same API. Results never wait for it; if it is slow, missing or unsure, the page falls back to simple rules.
- Queries about live data are not answered from search snippets or the model.

**Live cards**

- **Weather**: current conditions and a 7-day forecast from [Open-Meteo](https://open-meteo.com/).
- **Local time**: a ticking clock for a city or country, with its UTC offset and the difference from your own zone.
- Only the extracted place name and coordinates are sent out, never the full query or the visitor's IP address.

**Admin console** at `/admin`

- Service health, request volume, latency percentiles, token use and per-engine success rates.
- Turn SearXNG engines on or off and weight them, configure AI and intent models, caching, timeouts and rate limits, all without a restart.
- A local usage log (with an option to skip query text), change history with one-click restore, and API keys encrypted at rest.

**Languages**: the interface is available in English, Simplified Chinese, Traditional Chinese, Japanese, German, French and Spanish, chosen from the browser's language.

## Quick start

You need Node.js 22.13 or later, pnpm and Docker.

```sh
docker compose -f docker/docker-compose.yml up -d   # SearXNG on 127.0.0.1:8888
cp .env.example .env.local                          # then fill it in
pnpm install
pnpm dev
```

Open <http://localhost:3000>. The admin console is at <http://localhost:3000/admin> once `ADMIN_PASSWORD` is set.

To run a production build:

```sh
pnpm build
PORT=3000 pnpm start
```

## Configuration

Environment variables are read from the process, then from `.env.local`. Keep `.env.local` out of version control.

| Variable                                   | Purpose                                                                                                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEARXNG_URL`                              | SearXNG base URL. Default `http://localhost:8888`.                                                                                                                                  |
| `ADMIN_PASSWORD`                           | Enables `/admin`. At least 12 characters. Also the key that encrypts API keys saved in the admin.                                                                                   |
| `DATA_DIR`                                 | Where settings, history, keys and the usage log are stored. Default `./data`.                                                                                                       |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`    | Any OpenAI-compatible provider for summaries. The base URL defaults to OpenAI's; summaries stay off until a key and a model are set.                                                |
| `JEV_API_KEY`, `JEV_BASE_URL`, `JEV_MODEL` | Intent detection over the System One API. Defaults to `https://api.typesafe.ai/v1` and `jev-latest`. When `JEV_BASE_URL` is the same host as `AI_BASE_URL`, `AI_API_KEY` is reused. |
| `PORT`                                     | Port for `pnpm start`.                                                                                                                                                              |

Most other settings live in the admin console and take effect for the next request. Settings saved there override the environment.

`docker/searxng/settings.yml` holds SearXNG's own configuration: engine credentials, network timeouts, plugins and the JSON API format this app needs. It inherits SearXNG's defaults (`use_default_settings: true`); engines listed there are overrides, not an allow-list. Restart SearXNG after changing it.

### Data on disk

`DATA_DIR` contains:

- `settings.json` and `settings.json.bak`: written atomically with revision checks.
- `history.jsonl`: the last 50 changes, recording field names and values but never key values.
- `secrets.json`: API keys entered in the admin, encrypted with AES-256-GCM using a key derived from `ADMIN_PASSWORD`. Changing the password makes stored keys unreadable, so enter them again afterwards.
- `usage.sqlite`: request type, timing, result count, cache hits, tokens, model, errors and, optionally, query text. Response content is never stored. Records are kept for 90 days by default.

Restrict access to this directory and to its backups.

## Privacy

- SearXNG listens on localhost only; the app is the single public entry point.
- Images load directly from their source with `no-referrer`. Site icons are fetched by the server.
- AI requests send the query and the top result snippets to the configured provider. Live cards send only a place name and coordinates.
- Usage logging can be turned off, or kept without query text.

## Deployment notes

- `Dockerfile` builds the app, and `docker/docker-compose.prod.yml` runs it together with its own SearXNG. Set `ADMIN_PASSWORD` and `SEARXNG_SECRET`, and point your reverse proxy at port 3000 of the `web` service. Settings and keys live in the `web-data` volume.
- The app runs as a single Node process: settings writes, caches and rate limits are kept in that process. Do not run several copies against the same `DATA_DIR`.
- Put it behind a reverse proxy that terminates HTTPS and sets `X-Forwarded-For`. Rate limits are counted per client IP taken from that header.
- Back up `DATA_DIR`.

## Development

```sh
pnpm dev         # dev server on port 3000
pnpm check       # Biome lint and format check, type check, tests
pnpm lint        # Biome lint only
pnpm format      # format everything with Biome
pnpm test        # Vitest
pnpm build       # production build into dist/
```

CI runs the same checks and a build on Node 22.13 and 24.

```text
src/routes/     pages, search layout, admin, API routes and OpenSearch
src/server/     search, caching, settings, auth, AI, intent and live data (*.server.ts never reach the browser)
src/features/   search box, results, AI summary, live cards and the admin console
src/lib/        shared types, settings schema, language detection, translations and error codes
src/ui/         design tokens and styles
docker/         local SearXNG setup
```

The product name shown in the interface is set in `src/lib/brand.ts`.

## Credits

Search results come from [SearXNG](https://github.com/searxng/searxng). Weather data is from [Open-Meteo](https://open-meteo.com/) (CC BY 4.0). Place names are resolved with Open-Meteo's geocoding and, as a fallback, [OpenStreetMap Nominatim](https://nominatim.org/), which is queried at most once per second as its usage policy requires.

## License

[MIT](LICENSE)
