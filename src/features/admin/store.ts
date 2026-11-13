import { createContext, createSignal, useContext } from 'solid-js'
import type { AdminData, SecretName, Settings } from '~/lib/settings'
import { resetAdminSettingsFn, restoreSettingsFn, saveAdminSettingsFn } from '~/server/admin.functions'
import { useAdminText } from './i18n'

export type SecretDraft = Partial<Record<SecretName, string | null>>

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Draft state shared by every admin section. Each section saves only its own keys. */
export function createAdminStore(initial: AdminData) {
  const text = useAdminText()
  const [data, setData] = createSignal(initial)
  const [draft, setDraft] = createSignal<Settings>(structuredClone(initial.settings))
  const [secrets, setSecrets] = createSignal<SecretDraft>({})
  const [busy, setBusy] = createSignal(false)
  const [notice, setNotice] = createSignal('')
  const [error, setError] = createSignal('')
  /** Which section the notice or error belongs to. */
  const [scope, setScope] = createSignal('')

  const changed = (key: keyof Settings) => !same(draft()[key], data().settings[key])
  const dirty = (keys: ReadonlyArray<keyof Settings>, secretNames: ReadonlyArray<SecretName> = []) =>
    keys.some(changed) || secretNames.some(name => secrets()[name] !== undefined)
  const anyDirty = () =>
    (Object.keys(draft()) as Array<keyof Settings>).some(changed) || Object.keys(secrets()).length > 0

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft(d => ({ ...d, [key]: value }))
  const patch = <K extends 'ai' | 'jev' | 'usage' | 'limits' | 'live'>(key: K, value: Partial<Settings[K]>) =>
    setDraft(d => ({ ...d, [key]: { ...d[key], ...value } }))
  const setSecret = (name: SecretName, value: string | null | undefined) =>
    setSecrets(current => {
      const next = { ...current }
      if (value === undefined) delete next[name]
      else next[name] = value
      return next
    })

  /** Adopt the server snapshot but keep edits in sections that were not saved. */
  const accept = (next: AdminData, saved: ReadonlyArray<keyof Settings>) => {
    const pending = (Object.keys(draft()) as Array<keyof Settings>).filter(key => !saved.includes(key) && changed(key))
    const kept = Object.fromEntries(pending.map(key => [key, draft()[key]]))
    setData(next)
    setDraft({ ...structuredClone(next.settings), ...kept })
  }

  const run = async (action: () => Promise<void>, success: string, owner: string) => {
    setScope(owner)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(success)
    } catch (e) {
      setError(text.error(e))
    } finally {
      setBusy(false)
    }
  }

  const save = (keys: ReadonlyArray<keyof Settings>, secretNames: ReadonlyArray<SecretName> = []) =>
    run(
      async () => {
        const settings = { ...data().settings, ...Object.fromEntries(keys.map(key => [key, draft()[key]])) } as Settings
        const pending = Object.fromEntries(
          secretNames.flatMap(name => (secrets()[name] === undefined ? [] : [[name, secrets()[name]]])),
        )
        accept(await saveAdminSettingsFn({ data: { revision: data().revision, settings, secrets: pending } }), keys)
        for (const name of secretNames) setSecret(name, undefined)
      },
      text.t('saved'),
      keys.join(),
    )

  const reset = () =>
    run(
      async () => {
        accept(
          await resetAdminSettingsFn({ data: { revision: data().revision } }),
          Object.keys(draft()) as Array<keyof Settings>,
        )
      },
      text.t('resetDone'),
      'reset',
    )

  const restore = (revision: number) =>
    run(
      async () => {
        accept(
          await restoreSettingsFn({ data: { revision, current: data().revision } }),
          Object.keys(draft()) as Array<keyof Settings>,
        )
      },
      text.t('restored', { revision }),
      'reset',
    )

  return {
    data,
    restore,
    draft,
    secrets,
    busy,
    notice,
    error,
    scope,
    dirty,
    anyDirty,
    update,
    patch,
    setSecret,
    save,
    reset,
    setError,
    setNotice,
  }
}

export type AdminStore = ReturnType<typeof createAdminStore>
export const AdminContext = createContext<AdminStore>()
export function useAdmin(): AdminStore {
  const store = useContext(AdminContext)
  if (!store) throw new Error('AdminContext is missing')
  return store
}
