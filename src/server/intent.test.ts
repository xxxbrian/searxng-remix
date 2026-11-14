import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QUERY_INTENTS } from '~/lib/search-decision'
import { defaultSettings } from '~/lib/settings'

const mocks = vi.hoisted(() => ({
  config: {
    AI_API_KEY: 'test-key',
    AI_BASE_URL: 'https://ai.example.test/v1',
    AI_MODEL: 'test/chat',
    JEV_API_KEY: '',
    JEV_BASE_URL: 'https://ai.example.test/v1',
    JEV_MODEL: 'test/jev',
  },
  stored: {} as Record<string, string>,
  settings: undefined as unknown as ReturnType<typeof defaultSettings>,
}))
vi.mock('./env.server', () => ({ env: () => mocks.config }))
vi.mock('./secrets.server', () => ({
  readSecret: async (name: string) => mocks.stored[name],
  secretStatus: async () => ({ source: 'none' }),
}))
vi.mock('./usage.server', () => ({ recordUsage: async () => undefined, recordEngineCalls: async () => undefined }))
vi.mock('./settings.server', () => ({ readSettings: async () => ({ settings: mocks.settings }) }))

function choice(intent: (typeof QUERY_INTENTS)[number], confidence = 1) {
  return {
    answers: {
      intent: {
        type: 'choice',
        choice: intent,
        confidence,
        probabilities: Object.fromEntries(QUERY_INTENTS.map(key => [key, key === intent ? 1 : 0])),
      },
    },
  }
}
let request: ReturnType<typeof vi.fn<typeof fetch>>
beforeEach(() => {
  vi.resetModules()
  mocks.settings = defaultSettings()
  mocks.stored = {}
  Object.assign(mocks.config, {
    AI_API_KEY: 'test-key',
    JEV_API_KEY: '',
    JEV_BASE_URL: 'https://ai.example.test/v1',
    JEV_MODEL: 'test/jev',
  })
  request = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', request)
})

describe('Jev decisions', () => {
  it('sends only query context, validates decisions and coalesces/caches matching requests', async () => {
    request.mockResolvedValue(Response.json(choice('explanation')))
    const { classifyQuery } = await import('./intent.server')
    const [first, second] = await Promise.all([
      classifyQuery('what is backpropagation'),
      classifyQuery('what is backpropagation'),
    ])
    expect(first).toEqual({ intent: 'explanation', summary: 'auto', confidence: 1, source: 'jev' })
    expect(second).toEqual(first)
    expect(await classifyQuery('  WHAT is   backpropagation ')).toEqual(first)
    expect(request).toHaveBeenCalledTimes(1)
    const [url, options] = request.mock.calls[0]!
    expect(url).toBe('https://ai.example.test/v1/systemone')
    const body = JSON.parse(options!.body as string)
    expect(body.state).toEqual({ query: 'what is backpropagation' })
    expect(Object.keys(body.questions)).toEqual(['intent'])
    expect(body.model).toBe('test/jev')
    expect(options!.signal).toBeInstanceOf(AbortSignal)
  })

  it('supports a separate key and endpoint without exposing them in the decision', async () => {
    mocks.config.JEV_API_KEY = 'separate-test-key'
    mocks.config.JEV_BASE_URL = 'https://intent.example.test/v1/'
    request.mockResolvedValue(Response.json(choice('comparison')))
    const { classifyQuery } = await import('./intent.server')
    const result = await classifyQuery('Solid vs Svelte')
    expect(request.mock.calls[0]![0]).toBe('https://intent.example.test/v1/systemone')
    expect(request.mock.calls[0]![1]!.headers).toMatchObject({ authorization: 'Bearer separate-test-key' })
    expect(JSON.stringify(result)).not.toContain('key')
  })

  it('never sends the AI key to a different intent host', async () => {
    mocks.config.JEV_BASE_URL = 'https://intent.example.test/v1'
    const { classifyQuery } = await import('./intent.server')
    expect(await classifyQuery('what is rust')).toMatchObject({ source: 'fallback' })
    expect(request).not.toHaveBeenCalled()
  })

  it('stays off without a model', async () => {
    mocks.config.JEV_MODEL = ''
    const { classifyQuery } = await import('./intent.server')
    expect(await classifyQuery('what is rust')).toMatchObject({ source: 'fallback' })
    expect(request).not.toHaveBeenCalled()
  })

  it('prefers admin-stored keys and endpoints over the environment', async () => {
    mocks.stored.jev = 'stored-key'
    mocks.settings.jev = { ...mocks.settings.jev, baseUrl: 'https://admin.example.test/v1', model: 'admin/jev' }
    request.mockResolvedValue(Response.json(choice('procedure')))
    const { classifyQuery } = await import('./intent.server')
    await classifyQuery('how to install rust')
    expect(request.mock.calls[0]![0]).toBe('https://admin.example.test/v1/systemone')
    expect(request.mock.calls[0]![1]!.headers).toMatchObject({ authorization: 'Bearer stored-key' })
    expect(JSON.parse(request.mock.calls[0]![1]!.body as string).model).toBe('admin/jev')
  })

  it('applies admin thresholds', async () => {
    mocks.settings.jev.minConfidence = 0.99
    request.mockResolvedValue(Response.json(choice('explanation', 0.9)))
    const { classifyQuery } = await import('./intent.server')
    expect(await classifyQuery('what is rust')).toMatchObject({ source: 'fallback' })
  })

  it.each(['weather', 'live', 'navigation'] as const)('suppresses synthesis for confident %s intent', async intent => {
    request.mockResolvedValue(Response.json(choice(intent)))
    const { classifyQuery } = await import('./intent.server')
    expect(await classifyQuery('test query')).toMatchObject({ intent, summary: 'off' })
  })

  it('retains manual generation for uncertain decisions and retries the next time', async () => {
    const uncertain = choice('explanation', 0.4)
    uncertain.answers.intent.probabilities = Object.fromEntries(
      QUERY_INTENTS.map(key => [key, key === 'explanation' ? 0.6 : key === 'navigation' ? 0.4 : 0]),
    )
    request.mockResolvedValueOnce(Response.json(uncertain)).mockResolvedValueOnce(Response.json(choice('explanation')))
    const { classifyQuery } = await import('./intent.server')
    expect(await classifyQuery('ambiguous')).toMatchObject({ intent: 'unknown', summary: 'manual', source: 'fallback' })
    expect(await classifyQuery('ambiguous')).toMatchObject({ summary: 'auto', source: 'jev' })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it.each(['network', 'http', 'schema', 'distribution', 'winner'] as const)(
    'falls back safely on %s failures',
    async failure => {
      if (failure === 'network') request.mockRejectedValue(new DOMException('Timed out', 'TimeoutError'))
      else if (failure === 'http') request.mockResolvedValue(new Response(null, { status: 503 }))
      else if (failure === 'schema')
        request.mockResolvedValue(Response.json({ answers: { intent: { choice: 'other' } } }))
      else {
        const invalid = choice('explanation')
        if (failure === 'distribution') invalid.answers.intent.probabilities.navigation = 0.5
        else invalid.answers.intent.choice = 'navigation'
        request.mockResolvedValue(Response.json(invalid))
      }
      const { classifyQuery } = await import('./intent.server')
      expect(await classifyQuery('query')).toMatchObject({ summary: 'manual', source: 'fallback' })
    },
  )

  it.each(['disabled', 'no-key', 'ai-off'] as const)('makes no external call when %s', async reason => {
    if (reason === 'disabled') mocks.settings.jev.enabled = false
    if (reason === 'no-key') mocks.config.AI_API_KEY = ''
    if (reason === 'ai-off') mocks.settings.aiEnabled = false
    const { classifyQuery } = await import('./intent.server')
    expect(await classifyQuery('query')).toMatchObject({ summary: 'manual', source: 'fallback' })
    expect(request).not.toHaveBeenCalled()
  })
})
