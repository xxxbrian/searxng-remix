import { createSignal, Show } from 'solid-js'
import type { ConnectionTest, SecretName } from '~/lib/settings'
import { testEndpointFn } from '~/server/admin.functions'
import { Check, Field, NumberField, Panel, SectionForm } from './fields'
import { useAdminText } from './i18n'
import { useAdmin } from './store'

function ApiKey(props: { name: SecretName }) {
  const admin = useAdmin()
  const { t } = useAdminText()
  const info = () => admin.data().models[props.name]
  const pending = () => admin.secrets()[props.name]
  const status = () => {
    const { secret } = info()
    if (pending() === null) return t('keyRemoving')
    if (pending()) return t('keyReplacing')
    if (secret.unreadable) return t('keyUnreadable')
    if (secret.source === 'none') return t('notConfigured')
    const origin = secret.inherited ? t('keyShared') : secret.source === 'admin' ? t('keyAdmin') : t('keyEnv')
    return t('keySet', { last4: secret.last4 ?? '', origin })
  }
  return (
    <Field label="API Key" hint={status()} wide>
      <span class="inline">
        <input
          type="password"
          autocomplete="off"
          spellcheck={false}
          placeholder={t('keyPlaceholder')}
          value={typeof pending() === 'string' ? pending()! : ''}
          onInput={e => admin.setSecret(props.name, e.currentTarget.value.trim() || undefined)}
        />
        <Show when={info().secret.source === 'admin' || info().secret.unreadable}>
          <button
            type="button"
            class="btn btn-ghost"
            onClick={() => admin.setSecret(props.name, pending() === null ? undefined : null)}
          >
            {pending() === null ? t('undoRemove') : t('remove')}
          </button>
        </Show>
      </span>
    </Field>
  )
}

function TestButton(props: { name: SecretName }) {
  const admin = useAdmin()
  const text = useAdminText()
  const { t } = text
  const [result, setResult] = createSignal<ConnectionTest>()
  const [busy, setBusy] = createSignal(false)
  return (
    <div class="test">
      <button
        type="button"
        class="btn btn-ghost"
        disabled={busy()}
        onClick={async () => {
          setBusy(true)
          try {
            setResult(await testEndpointFn({ data: { name: props.name } }))
          } catch (e) {
            setResult({ ok: false, ms: 0, detail: text.error(e) })
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy() ? t('testing') : t('testSaved')}
      </button>
      <Show when={result()}>
        {r => (
          <span classList={{ error: !r().ok }}>
            {r().ok ? t('connected') : t('testFailed')} · {text.status(r().detail)}
            {r().ms ? ` · ${r().ms} ms` : ''}
          </span>
        )}
      </Show>
      <Show when={admin.dirty(['ai', 'jev'], ['ai', 'jev'])}>
        <span class="muted">{t('testExcludesDraft')}</span>
      </Show>
    </div>
  )
}

export function ModelsSection() {
  const admin = useAdmin()
  const { t } = useAdminText()
  const ai = () => admin.draft().ai
  const jev = () => admin.draft().jev
  const effective = (name: SecretName) => admin.data().models[name]
  return (
    <>
      <SectionForm keys={['ai']} secrets={['ai']}>
        <Panel title={t('aiTitle')} aside={t('aiProtocol')}>
          <div class="grid">
            <Field label="Base URL" hint={t('usesEnv')}>
              <input
                type="url"
                placeholder={effective('ai').baseUrl}
                value={ai().baseUrl}
                onInput={e => admin.patch('ai', { baseUrl: e.currentTarget.value.trim() })}
              />
            </Field>
            <Field label={t('model')} hint={t('usesEnv')}>
              <input
                placeholder={effective('ai').model}
                value={ai().model}
                onInput={e => admin.patch('ai', { model: e.currentTarget.value.trim() })}
              />
            </Field>
            <ApiKey name="ai" />
            <NumberField
              label={t('temperature')}
              min={0}
              max={1}
              step={0.1}
              value={ai().temperature}
              onChange={temperature => admin.patch('ai', { temperature })}
            />
            <NumberField
              label={t('maxWords')}
              min={30}
              max={600}
              step={10}
              value={ai().maxWords}
              onChange={maxWords => admin.patch('ai', { maxWords })}
            />
            <NumberField
              label={t('sourceCount')}
              min={2}
              max={10}
              value={ai().sourceCount}
              onChange={sourceCount => admin.patch('ai', { sourceCount })}
            />
            <NumberField
              label={t('timeoutSec')}
              min={10}
              max={180}
              value={ai().timeoutSec}
              onChange={timeoutSec => admin.patch('ai', { timeoutSec })}
            />
            <Field label={t('instructions')} hint={t('instructionsHint')} wide>
              <textarea
                rows="3"
                maxlength="1000"
                value={ai().instructions}
                onInput={e => admin.patch('ai', { instructions: e.currentTarget.value })}
              />
            </Field>
          </div>
          <TestButton name="ai" />
        </Panel>
      </SectionForm>

      <SectionForm keys={['jev']} secrets={['jev']}>
        <Panel title={t('jevTitle')} aside="/systemone">
          <Check label={t('jevEnable')} checked={jev().enabled} onChange={enabled => admin.patch('jev', { enabled })} />
          <div class="grid">
            <Field label="Base URL" hint={t('usesEnv')}>
              <input
                type="url"
                placeholder={effective('jev').baseUrl}
                value={jev().baseUrl}
                onInput={e => admin.patch('jev', { baseUrl: e.currentTarget.value.trim() })}
              />
            </Field>
            <Field label={t('model')} hint={t('usesEnv')}>
              <input
                placeholder={effective('jev').model}
                value={jev().model}
                onInput={e => admin.patch('jev', { model: e.currentTarget.value.trim() })}
              />
            </Field>
            <ApiKey name="jev" />
            <NumberField
              label={t('timeoutMs')}
              min={300}
              max={10000}
              step={100}
              value={jev().timeoutMs}
              onChange={timeoutMs => admin.patch('jev', { timeoutMs })}
            />
            <NumberField
              label={t('cacheMinutes')}
              hint={t('zeroNoCache')}
              min={0}
              max={1440}
              value={jev().cacheMinutes}
              onChange={cacheMinutes => admin.patch('jev', { cacheMinutes })}
            />
            <NumberField
              label={t('minConfidence')}
              min={0.5}
              max={0.99}
              step={0.01}
              value={jev().minConfidence}
              onChange={minConfidence => admin.patch('jev', { minConfidence })}
            />
            <NumberField
              label={t('minTop')}
              hint={t('minTopHint')}
              min={0.5}
              max={0.99}
              step={0.01}
              value={jev().minTop}
              onChange={minTop => admin.patch('jev', { minTop })}
            />
            <NumberField
              label={t('minMargin')}
              min={0}
              max={0.9}
              step={0.01}
              value={jev().minMargin}
              onChange={minMargin => admin.patch('jev', { minMargin })}
            />
          </div>
          <TestButton name="jev" />
        </Panel>
      </SectionForm>
    </>
  )
}
