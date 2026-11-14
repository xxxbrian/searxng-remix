import { createEffect, createSignal, For, on, onCleanup, Show } from 'solid-js'
import { splitCitations } from '~/lib/cited'
import { useI18n } from '~/lib/i18n'
import { type SummaryEvent, summarizeFn } from '~/server/functions'

type Source = Extract<SummaryEvent, { type: 'sources' }>['sources'][number]
type Phase = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

interface AiSummaryProps {
  query: string
  lang: string
  /** Question-like queries start immediately when automatic summaries are enabled. */
  auto: boolean
}

export function AiSummary(props: AiSummaryProps) {
  const i18n = useI18n()
  const [phase, setPhase] = createSignal<Phase>('idle')
  const [text, setText] = createSignal('')
  const [sources, setSources] = createSignal<ReadonlyArray<Source>>([])
  const [expanded, setExpanded] = createSignal(false)

  // Invalidates in-flight streams when the search changes or the component unmounts.
  let generation = 0
  onCleanup(() => generation++)

  async function run() {
    const mine = ++generation
    setPhase('loading')
    setText('')
    setSources([])
    try {
      for await (const event of await summarizeFn({ data: { q: props.query, lang: props.lang } })) {
        if (mine !== generation) return
        if (event.type === 'sources') setSources(event.sources)
        else {
          setPhase('streaming')
          setText(t => t + event.text)
        }
      }
      if (mine === generation) setPhase('done')
    } catch {
      if (mine !== generation) return
      setPhase('error')
    }
  }

  createEffect(
    on(
      () => [props.query, props.lang, props.auto] as const,
      () => {
        generation++
        setPhase('idle')
        setText('')
        setSources([])
        setExpanded(false)
        if (props.auto) void run()
      },
    ),
  )

  return (
    <section class="ai" aria-labelledby="ai-title" aria-live="polite">
      <header class="ai-head">
        <h2 id="ai-title" class="label">
          {i18n.t('aiTitle')}
        </h2>
        <span class="ai-note">{i18n.t('aiNote')}</span>
      </header>

      <Show when={phase() === 'idle'}>
        <button type="button" class="btn" onClick={() => void run()}>
          {i18n.t('generate')}
        </button>
      </Show>

      <Show when={phase() === 'loading'}>
        <div class="skeleton" role="status" aria-busy="true" aria-label={i18n.t('generating')}>
          <span class="skeleton-line" style={{ width: '95%' }} />
          <span class="skeleton-line" style={{ width: '88%' }} />
          <span class="skeleton-line" style={{ width: '60%' }} />
        </div>
      </Show>

      <Show when={phase() === 'streaming' || phase() === 'done'}>
        <div id="ai-response" class="ai-response" data-expanded={expanded() ? '' : undefined}>
          <p class="ai-text" classList={{ 'ai-streaming': phase() === 'streaming' }}>
            <For each={splitCitations(text())}>
              {segment =>
                segment.kind === 'text' ? (
                  segment.text
                ) : (
                  <CitationLink n={segment.n} source={sources()[segment.n - 1]} />
                )
              }
            </For>
          </p>
          <Show when={sources().length > 0}>
            <ol class="ai-sources">
              <For each={sources()}>
                {(s, i) => (
                  <li>
                    <a href={s.url} rel="noreferrer noopener" target="_blank">
                      <span class="ai-source-n">{i() + 1}</span>
                      {s.host}
                    </a>
                  </li>
                )}
              </For>
            </ol>
          </Show>
        </div>
        <button
          type="button"
          class="btn btn-ghost ai-expand"
          aria-expanded={expanded()}
          aria-controls="ai-response"
          onClick={() => setExpanded(value => !value)}
        >
          {i18n.t(expanded() ? 'collapseSummary' : 'expandSummary')}
        </button>
      </Show>

      <Show when={phase() === 'error'}>
        <p class="ai-error">{i18n.t('generationFailed')}</p>
        <button type="button" class="btn btn-ghost" onClick={() => void run()}>
          {i18n.t('retry')}
        </button>
      </Show>
    </section>
  )
}

function CitationLink(props: { n: number; source: Source | undefined }) {
  return (
    <Show when={props.source} fallback={<sup class="cite">{props.n}</sup>}>
      {source => (
        <sup class="cite">
          <a href={source().url} target="_blank" rel="noreferrer noopener" title={source().host}>
            {props.n}
          </a>
        </sup>
      )}
    </Show>
  )
}
