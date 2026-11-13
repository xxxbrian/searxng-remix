import type { ConnectionTest, EndpointInfo, SecretName, SecretStatus, Settings } from '~/lib/settings'
import { env } from './env.server'
import { readSecret, secretStatus } from './secrets.server'

export interface ModelEndpoint {
  baseUrl: string
  model: string
  apiKey: string
}

const trimSlash = (url: string) => url.replace(/\/+$/, '')

/**
 * Settings win over environment. The intent service borrows the AI provider's
 * key only when both point at the same host, so a key never reaches a provider
 * it was not issued by.
 */
function resolveBase(name: SecretName, settings: Settings) {
  const config = env()
  const ai = {
    baseUrl: trimSlash(settings.ai.baseUrl || config.AI_BASE_URL),
    model: settings.ai.model || config.AI_MODEL,
  }
  if (name === 'ai') return { ...ai, envKey: config.AI_API_KEY || undefined, sharesAiHost: false }
  const baseUrl = trimSlash(settings.jev.baseUrl || config.JEV_BASE_URL)
  return {
    baseUrl,
    model: settings.jev.model || config.JEV_MODEL,
    envKey: config.JEV_API_KEY || undefined,
    sharesAiHost: baseUrl === ai.baseUrl,
  }
}

interface FoundKey {
  key: string
  source: 'admin' | 'env'
  inherited: boolean
}

async function findKey(
  name: SecretName,
  envKey: string | undefined,
  sharesAiHost: boolean,
  inherited = false,
): Promise<FoundKey | undefined> {
  const stored = await readSecret(name)
  if (stored) return { key: stored, source: 'admin', inherited }
  if (envKey) return { key: envKey, source: 'env', inherited }
  return name === 'jev' && sharesAiHost ? findKey('ai', env().AI_API_KEY || undefined, false, true) : undefined
}

/** Null without a key or a model: callers hide or skip the feature. */
export async function resolveEndpoint(name: SecretName, settings: Settings): Promise<ModelEndpoint | null> {
  const { baseUrl, model, envKey, sharesAiHost } = resolveBase(name, settings)
  const found = await findKey(name, envKey, sharesAiHost)
  return found && model ? { baseUrl, model, apiKey: found.key } : null
}

export async function describeEndpoint(name: SecretName, settings: Settings): Promise<EndpointInfo> {
  const { baseUrl, model, envKey, sharesAiHost } = resolveBase(name, settings)
  const found = await findKey(name, envKey, sharesAiHost)
  const secret: SecretStatus = found
    ? { source: found.source, last4: found.key.slice(-4), inherited: found.inherited }
    : { source: 'none', unreadable: (await secretStatus(name)).unreadable }
  return { baseUrl: trimSlash(baseUrl), model, secret }
}

/** Minimal real request against the saved configuration; never echoes upstream bodies. */
export async function testEndpoint(name: SecretName, settings: Settings): Promise<ConnectionTest> {
  const endpoint = await resolveEndpoint(name, settings)
  if (!endpoint) return { ok: false, ms: 0, detail: resolveBase(name, settings).model ? 'noKey' : 'noModel' }
  const started = performance.now()
  const request =
    name === 'ai'
      ? {
          path: '/chat/completions',
          body: { model: endpoint.model, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] },
        }
      : {
          path: '/systemone',
          body: {
            model: endpoint.model,
            state: { query: 'ping' },
            questions: {
              intent: {
                type: 'choice',
                instructions: 'Pick one.',
                criteria: { unknown: 'Anything.', navigation: 'A site.' },
              },
            },
          },
        }
  try {
    const response = await fetch(`${endpoint.baseUrl}${request.path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${endpoint.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(15_000),
    })
    const ms = Math.round(performance.now() - started)
    return response.ok
      ? { ok: true, ms, detail: `HTTP ${response.status}` }
      : { ok: false, ms, detail: `HTTP ${response.status}` }
  } catch (error) {
    return {
      ok: false,
      ms: Math.round(performance.now() - started),
      detail: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unreachable',
    }
  }
}
