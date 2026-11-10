import { Link, useNavigate } from '@tanstack/solid-router'
import { createSignal, For, Show } from 'solid-js'
import { useI18n } from '~/lib/i18n'
import { TABS, type Tab, TIME_RANGES, type TimeRange } from '~/lib/types'

export function Tabs(props: { current: Tab }) {
  const i18n = useI18n()
  return (
    <nav class="tabs" aria-label={i18n.t('searchTypes')}>
      <For each={TABS}>
        {tab => (
          <Link
            from="/search"
            to="/search"
            search={prev => ({ ...prev, tab, page: 1 })}
            preload="intent"
            class="tab"
            data-current={props.current === tab ? '' : undefined}
          >
            {i18n.t(`tab_${tab}`)}
          </Link>
        )}
      </For>
    </nav>
  )
}

/** Time range and language. A bottom sheet on phones, an inline row on desktop. */
export function Tools(props: { time: TimeRange; lang: string }) {
  const i18n = useI18n()
  const navigate = useNavigate({ from: '/search' })
  const [open, setOpen] = createSignal(false)
  const languages = () => i18n.languages.filter(({ code }) => code !== 'auto')
  const languageName = () => languages().find(({ code }) => code === props.lang)?.name ?? props.lang
  const summary = () =>
    [props.time !== 'any' && i18n.t(`time_${props.time}`), props.lang !== 'auto' && languageName()]
      .filter(Boolean)
      .join(' · ')

  return (
    <div class="tools" classList={{ 'tools-open': open() }}>
      <button
        type="button"
        class="tools-toggle"
        aria-expanded={open()}
        aria-controls="tools-panel"
        onClick={() => setOpen(o => !o)}
      >
        {i18n.t('tools')}
        <Show when={summary()}>
          <span class="tools-summary">{summary()}</span>
        </Show>
      </button>

      <Show when={open()}>
        <button type="button" class="tools-scrim" aria-label={i18n.t('close')} onClick={() => setOpen(false)} />
      </Show>

      <div id="tools-panel" class="tools-panel" hidden={!open()}>
        <fieldset class="tools-group">
          <legend class="label">{i18n.t('time')}</legend>
          <For each={TIME_RANGES}>
            {time => (
              <Link
                from="/search"
                to="/search"
                search={prev => ({ ...prev, time, page: 1 })}
                class="chip"
                data-current={props.time === time ? '' : undefined}
                onClick={() => setOpen(false)}
              >
                {i18n.t(`time_${time}`)}
              </Link>
            )}
          </For>
        </fieldset>
        <fieldset class="tools-group">
          <legend class="label">{i18n.t('language')}</legend>
          <select
            class="chip"
            aria-label={i18n.t('language')}
            value={props.lang}
            onChange={event => {
              const lang = event.currentTarget.value
              void navigate({ to: '/search', search: prev => ({ ...prev, lang, page: 1 }) })
              setOpen(false)
            }}
          >
            <option value="auto" selected={props.lang === 'auto'}>
              {i18n.t('auto')}
            </option>
            <Show when={props.lang !== 'auto' && !languages().some(({ code }) => code === props.lang)}>
              <option value={props.lang} selected>
                {props.lang}
              </option>
            </Show>
            <For each={languages()}>
              {language => (
                <option value={language.code} selected={props.lang === language.code}>
                  {language.name}
                </option>
              )}
            </For>
          </select>
        </fieldset>
      </div>
    </div>
  )
}

export function Pager(props: { page: number; hasNext: boolean }) {
  const i18n = useI18n()
  // The JSON API does not expose a total page count. Show the current and
  // preceding pages, plus a single next-page attempt when results are present.
  const first = () => Math.max(1, props.page - 4)
  const pages = () => Array.from({ length: props.page - first() + 1 }, (_, i) => first() + i)

  return (
    <nav class="pager" aria-label={i18n.t('pagination')}>
      <Show when={props.page > 1}>
        <Link
          from="/search"
          to="/search"
          search={p => ({ ...p, page: props.page - 1 })}
          class="pager-link"
          preload="intent"
        >
          ← {i18n.t('previous')}
        </Link>
      </Show>
      <For each={pages()}>
        {n => (
          <Link
            from="/search"
            to="/search"
            search={p => ({ ...p, page: n })}
            class="pager-link"
            preload="intent"
            data-current={n === props.page ? '' : undefined}
          >
            {n}
          </Link>
        )}
      </For>
      <Show when={props.hasNext && props.page < 10}>
        <Link
          from="/search"
          to="/search"
          search={p => ({ ...p, page: props.page + 1 })}
          class="pager-link"
          preload="intent"
        >
          {i18n.t('next')} →
        </Link>
      </Show>
    </nav>
  )
}
