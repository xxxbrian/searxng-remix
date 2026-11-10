import { z } from 'zod'

const schema = z.object({
  SEARXNG_URL: z.url().default('http://localhost:8888'),
  AI_API_KEY: z.string().optional(),
  // Any OpenAI-compatible provider. Summaries stay off until a key and a model are set.
  AI_BASE_URL: z.url().default('https://api.openai.com/v1'),
  AI_MODEL: z.string().default(''),
  // Intent detection speaks the System One decision API; TypeSafe's Jev is the reference model.
  JEV_BASE_URL: z.url().default('https://api.typesafe.ai/v1'),
  JEV_MODEL: z.string().default('jev-latest'),
  JEV_API_KEY: z.string().optional(),
  ADMIN_PASSWORD: z.preprocess(value => (value === '' ? undefined : value), z.string().min(12).optional()),
  DATA_DIR: z.string().default('./data'),
})

let cached: z.infer<typeof schema> | undefined

/** Parsed lazily so a missing optional key never breaks unrelated routes. */
export function env() {
  cached ??= schema.parse(process.env)
  return cached
}
