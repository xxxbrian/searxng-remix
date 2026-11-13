import { type JSX, Show } from 'solid-js'
import type { SecretName, Settings } from '~/lib/settings'
import { useAdminText } from './i18n'
import { useAdmin } from './store'

export function Panel(props: { title: string; aside?: JSX.Element; children: JSX.Element }) {
  return (
    <section class="panel">
      <header class="panel-head">
        <h2>{props.title}</h2>
        <Show when={props.aside}>
          <span>{props.aside}</span>
        </Show>
      </header>
      {props.children}
    </section>
  )
}

export function Field(props: { label: string; hint?: string; wide?: boolean; children: JSX.Element }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control arrives as children
    <label class="field" classList={{ 'field-wide': props.wide }}>
      <span class="field-label">{props.label}</span>
      {props.children}
      <Show when={props.hint}>
        <small>{props.hint}</small>
      </Show>
    </label>
  )
}

export function NumberField(props: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <Field label={props.label} hint={props.hint}>
      <input
        type="number"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={e => {
          const n = e.currentTarget.valueAsNumber
          if (Number.isFinite(n)) props.onChange(Math.min(props.max, Math.max(props.min, n)))
          else e.currentTarget.value = String(props.value)
        }}
      />
    </Field>
  )
}

export function Check(props: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label class="check">
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={e => props.onChange(e.currentTarget.checked)}
      />
      {props.label}
    </label>
  )
}

/** Per-section save bar: only the keys it owns are written. */
export function SaveBar(props: { keys: ReadonlyArray<keyof Settings>; secrets?: ReadonlyArray<SecretName> }) {
  const admin = useAdmin()
  const { t } = useAdminText()
  const dirty = () => admin.dirty(props.keys, props.secrets)
  const mine = () => admin.scope() === props.keys.join()
  return (
    <footer class="savebar">
      <div aria-live="polite">
        <Show when={mine() && admin.error()}>
          <span class="error" role="alert">
            {admin.error()}
          </span>
        </Show>
        <Show when={!(mine() && admin.error()) && dirty()}>
          <span>{t('unsaved')}</span>
        </Show>
        <Show when={mine() && !admin.error() && !dirty() && admin.notice()}>
          <span>{admin.notice()}</span>
        </Show>
      </div>
      <button class="btn" type="submit" disabled={!dirty() || admin.busy()}>
        {admin.busy() ? t('saving') : t('save')}
      </button>
    </footer>
  )
}

export function SectionForm(props: {
  keys: ReadonlyArray<keyof Settings>
  secrets?: ReadonlyArray<SecretName>
  children: JSX.Element
}) {
  const admin = useAdmin()
  return (
    <form
      class="section-form"
      onSubmit={e => {
        e.preventDefault()
        void admin.save(props.keys, props.secrets)
      }}
    >
      {props.children}
      <SaveBar keys={props.keys} secrets={props.secrets} />
    </form>
  )
}
