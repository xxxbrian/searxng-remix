import { createQuery, keepPreviousData } from '@tanstack/solid-query'
import { useNavigate } from '@tanstack/solid-router'
import { createEffect, createSignal, createUniqueId, For, on, onCleanup, onMount, Show } from 'solid-js'
import { createDebounced } from '~/lib/debounce'
import { useI18n } from '~/lib/i18n'
import { DEFAULT_SEARCH } from '~/lib/search-params'
import type { Tab } from '~/lib/types'
import { suggestFn } from '~/server/functions'

interface SearchBoxProps {
  initial?: string
  variant: 'hero' | 'compact'
  /** Keep the current tab when searching again from a results page. */
  tab?: Tab
  lang?: string
}

export function SearchBox(props: SearchBoxProps) {
  const i18n = useI18n()
  const navigate = useNavigate()
  const listId = createUniqueId()
  let input!: HTMLInputElement

  const [value, setValue] = createSignal(props.initial ?? '')
  const [open, setOpen] = createSignal(false)
  const [active, setActive] = createSignal(-1)

  // A new search from elsewhere (related link, history) updates the field.
  createEffect(
    on(
      () => props.initial,
      next => setValue(next ?? ''),
      { defer: true },
    ),
  )

  const term = createDebounced(() => value().trim(), 150)
  const suggestions = createQuery(() => ({
    queryKey: ['suggest', term()],
    queryFn: () => suggestFn({ data: { q: term() } }),
    enabled: open() && term().length > 0,
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  }))
  // Reading pending Solid Query data suspends the enclosing route. Autocomplete
  // is optional: keep the input mounted while a new suggestion request loads.
  const options = () => (open() && term() && suggestions.isSuccess ? suggestions.data : [])

  const submit = (q: string) => {
    const query = q.trim()
    if (!query) return
    setValue(query)
    setOpen(false)
    input.blur()
    void navigate({
      to: '/search',
      search: { ...DEFAULT_SEARCH, q: query, tab: props.tab ?? 'all', lang: props.lang ?? 'auto' },
    })
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const count = options().length
    if (e.key === 'ArrowDown' && count) {
      e.preventDefault()
      setActive(i => (i + 1) % count)
    } else if (e.key === 'ArrowUp' && count) {
      e.preventDefault()
      setActive(i => (i <= 0 ? count - 1 : i - 1))
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Enter' && active() >= 0) {
      e.preventDefault()
      submit(options()[active()] ?? value())
    }
  }

  // "/" focuses the box from anywhere, like on Google.
  onMount(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target?.matches('input, textarea, [contenteditable]')
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        input.focus()
        input.select()
      }
    }
    document.addEventListener('keydown', onGlobalKey)
    onCleanup(() => document.removeEventListener('keydown', onGlobalKey))
  })

  return (
    <search
      class="sbox"
      classList={{ 'sbox-hero': props.variant === 'hero' }}
      onFocusOut={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <form
        class="sbox-field"
        onSubmit={e => {
          e.preventDefault()
          submit(value())
        }}
      >
        <svg class="sbox-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={input}
          class="sbox-input"
          type="search"
          name="q"
          role="combobox"
          aria-label={i18n.t('search')}
          aria-autocomplete="list"
          aria-expanded={options().length > 0}
          aria-controls={listId}
          aria-activedescendant={active() >= 0 ? `${listId}-${active()}` : undefined}
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          enterkeyhint="search"
          autofocus={props.variant === 'hero'}
          placeholder={i18n.t('search')}
          value={value()}
          onInput={e => {
            setValue(e.currentTarget.value)
            setActive(-1)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <Show when={value()}>
          <button
            type="button"
            class="sbox-clear"
            aria-label={i18n.t('clear')}
            onClick={() => {
              setValue('')
              input.focus()
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </Show>
        <button type="submit" class="sbox-submit">
          {i18n.t('search')}
        </button>
      </form>

      <Show when={options().length > 0}>
        <div class="sbox-list" id={listId} role="listbox" aria-label={i18n.t('suggestions')}>
          <For each={options()}>
            {(option, i) => (
              // biome-ignore lint/a11y/useFocusableInteractive: focus stays in the input, which points here with aria-activedescendant
              // biome-ignore lint/a11y/useKeyWithClickEvents: the input handles the arrow keys and Enter for the whole list
              <div
                id={`${listId}-${i()}`}
                role="option"
                aria-selected={active() === i()}
                class="sbox-option"
                onMouseEnter={() => setActive(i())}
                onMouseDown={e => e.preventDefault()}
                onClick={() => submit(option)}
              >
                {option}
              </div>
            )}
          </For>
        </div>
      </Show>
    </search>
  )
}
