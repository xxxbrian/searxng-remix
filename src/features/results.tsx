import { createSignal, createUniqueId, For, onCleanup, onMount, Show } from 'solid-js'
import { isNumericAnswer } from '~/lib/search-decision'
import type { Hit, InfoboxData } from '~/lib/types'
import { Favicon } from './favicon'
import '~/ui/media.css'

// Structural extension keeps these components compatible while shared search types evolve.
type MediaHit = Hit & { author?: string; duration?: string; resolution?: string; source?: string }

export const mediaMessages = {
  zh: {
    preview: '预览图片',
    close: '关闭预览',
    visitSource: '访问来源',
    originalImage: '打开原图',
    imageUnavailable: '图片无法加载',
    thumbnailUnavailable: '预览图不可用',
    resolutionUnavailable: '尺寸未知',
    knowledge: '知识面板',
    answer: '即时答案',
    source: '来源',
    duration: '时长',
    published: '发布日期',
    author: '作者',
  },
  en: {
    preview: 'Preview image',
    close: 'Close preview',
    visitSource: 'Visit source',
    originalImage: 'Open original image',
    imageUnavailable: 'Image unavailable',
    thumbnailUnavailable: 'Preview unavailable',
    resolutionUnavailable: 'Size unavailable',
    knowledge: 'Knowledge panel',
    answer: 'Instant answer',
    source: 'Source',
    duration: 'Duration',
    published: 'Published',
    author: 'Author',
  },
  ja: {
    preview: '画像をプレビュー',
    close: 'プレビューを閉じる',
    visitSource: '掲載元を開く',
    originalImage: '元の画像を開く',
    imageUnavailable: '画像を読み込めません',
    thumbnailUnavailable: 'プレビューなし',
    resolutionUnavailable: 'サイズ不明',
    knowledge: 'ナレッジパネル',
    answer: '即時回答',
    source: '掲載元',
    duration: '再生時間',
    published: '公開日',
    author: '投稿者',
  },
  de: {
    preview: 'Bildvorschau',
    close: 'Vorschau schließen',
    visitSource: 'Quelle besuchen',
    originalImage: 'Originalbild öffnen',
    imageUnavailable: 'Bild nicht verfügbar',
    thumbnailUnavailable: 'Vorschau nicht verfügbar',
    resolutionUnavailable: 'Größe unbekannt',
    knowledge: 'Wissensübersicht',
    answer: 'Direktantwort',
    source: 'Quelle',
    duration: 'Dauer',
    published: 'Veröffentlicht',
    author: 'Autor',
  },
  fr: {
    preview: 'Aperçu de l’image',
    close: 'Fermer l’aperçu',
    visitSource: 'Consulter la source',
    originalImage: 'Ouvrir l’image originale',
    imageUnavailable: 'Image indisponible',
    thumbnailUnavailable: 'Aperçu indisponible',
    resolutionUnavailable: 'Dimensions inconnues',
    knowledge: 'Fiche de connaissances',
    answer: 'Réponse directe',
    source: 'Source',
    duration: 'Durée',
    published: 'Publication',
    author: 'Auteur',
  },
  es: {
    preview: 'Vista previa de imagen',
    close: 'Cerrar vista previa',
    visitSource: 'Visitar fuente',
    originalImage: 'Abrir imagen original',
    imageUnavailable: 'Imagen no disponible',
    thumbnailUnavailable: 'Vista previa no disponible',
    resolutionUnavailable: 'Tamaño desconocido',
    knowledge: 'Panel de conocimiento',
    answer: 'Respuesta directa',
    source: 'Fuente',
    duration: 'Duración',
    published: 'Publicado',
    author: 'Autor',
  },
} as const

type MediaLocale = keyof typeof mediaMessages
type MediaMessage = keyof typeof mediaMessages.en

function mediaLocale(locale?: string): MediaLocale {
  const language = locale?.toLowerCase().split(/[-_]/)[0] ?? 'zh'
  return Object.hasOwn(mediaMessages, language) ? (language as MediaLocale) : 'en'
}

function message(locale: string | undefined, key: MediaMessage): string {
  return mediaMessages[mediaLocale(locale)][key]
}

function externalUrl(value?: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

function imageUrl(value?: string): string | undefined {
  if (value && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(value)) return value
  return externalUrl(value)
}

/** Tries each distinct source once, then shows a deliberate, readable empty state. */
function MediaImage(props: {
  src?: string
  fallback?: string
  alt: string
  unavailable: string
  eager?: boolean
  onDimensions?: (width: number, height: number, src: string) => void
}) {
  const [failed, setFailed] = createSignal<ReadonlyArray<string>>([])
  const source = () =>
    [imageUrl(props.src), imageUrl(props.fallback)].find((src): src is string => !!src && !failed().includes(src))

  return (
    <span class="media-frame" data-unavailable={!source() ? '' : undefined}>
      <Show when={source()} keyed fallback={<span class="media-unavailable">{props.unavailable}</span>}>
        {src => (
          <img
            src={src}
            alt={props.alt}
            loading={props.eager ? 'eager' : 'lazy'}
            decoding="async"
            referrerpolicy="no-referrer"
            onError={() => setFailed(previous => [...previous, src])}
            onLoad={event =>
              props.onDimensions?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight, src)
            }
          />
        )}
      </Show>
    </span>
  )
}

export function WebHit(props: { hit: MediaHit; locale?: string }) {
  return (
    <article
      class="hit media-web-hit"
      data-thumbnail={imageUrl(props.hit.thumbnail) || imageUrl(props.hit.imageSrc) ? '' : undefined}
    >
      <div class="hit-copy">
        <div class="hit-src">
          <Favicon host={props.hit.host} />
          <b class="hit-host">{props.hit.host}</b>
          <span class="hit-crumbs">{props.hit.crumbs}</span>
        </div>
        <h2 class="hit-title">
          <a href={externalUrl(props.hit.url)} rel="noreferrer noopener">
            {props.hit.title}
          </a>
        </h2>
        <p class="hit-snippet">
          <Show when={props.hit.publishedDate}>
            {date => (
              <time class="hit-date" dateTime={date()}>
                {formatDate(date(), props.locale)} ·{' '}
              </time>
            )}
          </Show>
          {props.hit.snippet}
        </p>
      </div>
      <Show when={imageUrl(props.hit.thumbnail) || imageUrl(props.hit.imageSrc)}>
        <a class="web-thumb" href={externalUrl(props.hit.url)} rel="noreferrer noopener" aria-label={props.hit.title}>
          <MediaImage
            src={props.hit.thumbnail}
            fallback={props.hit.imageSrc}
            alt=""
            unavailable={message(props.locale, 'thumbnailUnavailable')}
          />
        </a>
      </Show>
    </article>
  )
}

export function ImageGrid(props: { hits: ReadonlyArray<MediaHit>; locale?: string }) {
  const [selection, setSelection] = createSignal<{ hit: MediaHit; trigger: HTMLButtonElement }>()

  return (
    <>
      <ul class="images media-images">
        <For each={props.hits.filter(hit => imageUrl(hit.imageSrc) || imageUrl(hit.thumbnail))}>
          {hit => (
            <li class="image media-image">
              <button
                type="button"
                class="image-open"
                aria-label={`${message(props.locale, 'preview')}: ${hit.title}`}
                aria-haspopup="dialog"
                onClick={event => setSelection({ hit, trigger: event.currentTarget })}
              >
                <MediaImage
                  src={hit.thumbnail}
                  fallback={hit.imageSrc}
                  alt=""
                  unavailable={message(props.locale, 'imageUnavailable')}
                />
                <span class="image-title">{hit.title}</span>
              </button>
              <div class="image-meta">
                <a
                  class="image-source"
                  href={externalUrl(hit.url)}
                  rel="noreferrer noopener"
                  aria-label={`${message(props.locale, 'source')}: ${hit.source || hit.host}`}
                >
                  {hit.source || hit.host}
                </a>
                <span class="image-resolution">{hit.resolution || message(props.locale, 'resolutionUnavailable')}</span>
              </div>
            </li>
          )}
        </For>
      </ul>
      <Show when={selection()} keyed>
        {selected => (
          <ImagePreview
            hit={selected.hit}
            trigger={selected.trigger}
            locale={props.locale}
            onClose={() => setSelection(undefined)}
          />
        )}
      </Show>
    </>
  )
}

function ImagePreview(props: { hit: MediaHit; trigger: HTMLButtonElement; locale?: string; onClose: () => void }) {
  let dialog!: HTMLDialogElement
  let closeButton!: HTMLButtonElement
  const titleId = createUniqueId()
  const descriptionId = createUniqueId()
  const [dimensions, setDimensions] = createSignal<string>()

  onMount(() => {
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    closeButton.focus()
    onCleanup(() => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (props.trigger.isConnected) props.trigger.focus({ preventScroll: true })
    })
  })

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a click outside the box closes it; Escape already does natively
    <dialog
      ref={dialog}
      class="media-preview"
      aria-labelledby={titleId}
      aria-describedby={props.hit.snippet ? descriptionId : undefined}
      onClose={props.onClose}
      onClick={event => {
        if (event.target !== dialog) return
        const rect = dialog.getBoundingClientRect()
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          dialog.close()
      }}
    >
      <div class="preview-toolbar">
        <span class="label">{message(props.locale, 'preview')}</span>
        <button
          ref={closeButton}
          class="preview-close"
          type="button"
          onClick={() => dialog.close()}
          aria-label={message(props.locale, 'close')}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div class="preview-layout">
        <div class="preview-image">
          <MediaImage
            src={props.hit.imageSrc}
            fallback={props.hit.thumbnail}
            alt={props.hit.title}
            unavailable={message(props.locale, 'imageUnavailable')}
            eager
            onDimensions={(width, height, src) => {
              if (src === imageUrl(props.hit.imageSrc) && width && height) setDimensions(`${width} × ${height}`)
            }}
          />
        </div>
        <div class="preview-detail">
          <p class="preview-source">{props.hit.source || props.hit.host}</p>
          <h2 id={titleId} class="preview-title">
            {props.hit.title}
          </h2>
          <p class="preview-resolution">
            {props.hit.resolution || dimensions() || message(props.locale, 'resolutionUnavailable')}
          </p>
          <Show when={props.hit.snippet}>
            <p id={descriptionId} class="preview-description">
              {props.hit.snippet}
            </p>
          </Show>
          <div class="preview-actions">
            <a class="preview-visit" href={externalUrl(props.hit.url)} target="_blank" rel="noreferrer noopener">
              {message(props.locale, 'visitSource')} <span aria-hidden="true">↗</span>
            </a>
            <Show when={externalUrl(props.hit.imageSrc)}>
              {src => (
                <a class="preview-original" href={src()} target="_blank" rel="noreferrer noopener">
                  {message(props.locale, 'originalImage')} <span aria-hidden="true">↗</span>
                </a>
              )}
            </Show>
          </div>
        </div>
      </div>
    </dialog>
  )
}

export function VideoGrid(props: { hits: ReadonlyArray<MediaHit>; locale?: string }) {
  return (
    <ul class="videos media-videos">
      <For each={props.hits}>
        {hit => (
          <li class="video media-video">
            <a class="video-link" href={externalUrl(hit.url)} rel="noreferrer noopener">
              <span class="video-thumb">
                <MediaImage
                  src={hit.thumbnail}
                  fallback={hit.imageSrc}
                  alt=""
                  unavailable={message(props.locale, 'thumbnailUnavailable')}
                />
                <span class="video-play" aria-hidden="true">
                  ▶
                </span>
                <Show when={hit.duration}>
                  {duration => (
                    <span class="video-duration">
                      <span class="sr-only">{message(props.locale, 'duration')}: </span>
                      {duration()}
                    </span>
                  )}
                </Show>
              </span>
              <span class="video-title">{hit.title}</span>
            </a>
            <div class="video-meta">
              <span class="video-source">
                <span class="sr-only">{message(props.locale, 'source')}: </span>
                {hit.source || hit.host}
              </span>
              <Show when={hit.author}>
                {author => (
                  <span class="video-author">
                    <span class="sr-only">{message(props.locale, 'author')}: </span>
                    {author()}
                  </span>
                )}
              </Show>
              <Show when={hit.publishedDate}>
                {date => (
                  <time class="video-date" dateTime={date()}>
                    <span class="sr-only">{message(props.locale, 'published')}: </span>
                    {formatDate(date(), props.locale)}
                  </time>
                )}
              </Show>
            </div>
            <Show when={hit.snippet}>
              <p class="video-snippet">{hit.snippet}</p>
            </Show>
          </li>
        )}
      </For>
    </ul>
  )
}

export function KnowledgePanel(props: { box: InfoboxData; locale?: string }) {
  const titleId = createUniqueId()
  return (
    <aside class="kp media-knowledge" aria-labelledby={titleId}>
      <p class="label">{message(props.locale, 'knowledge')}</p>
      <Show when={props.box.image}>
        {src => (
          <div class="knowledge-image">
            <MediaImage src={src()} alt="" unavailable={message(props.locale, 'imageUnavailable')} />
          </div>
        )}
      </Show>
      <h2 id={titleId} class="kp-title">
        {props.box.title}
      </h2>
      <p class="kp-body">{props.box.content}</p>
      <Show when={props.box.attributes.length > 0}>
        <dl class="kp-attrs">
          <For each={props.box.attributes.slice(0, 6)}>
            {a => (
              <>
                <dt>{a.label}</dt>
                <dd>{a.value}</dd>
              </>
            )}
          </For>
        </dl>
      </Show>
      <Show when={props.box.links.length > 0}>
        <ul class="kp-links">
          <For each={props.box.links.slice(0, 4)}>
            {link => (
              <li>
                <a href={externalUrl(link.url)} rel="noreferrer noopener">
                  {link.title} <span aria-hidden="true">↗</span>
                </a>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </aside>
  )
}

export function AnswerCard(props: { answers: ReadonlyArray<string>; locale?: string }) {
  return (
    <section
      class="answer"
      data-short={isNumericAnswer(props.answers[0] ?? '') ? '' : undefined}
      aria-label={message(props.locale, 'answer')}
    >
      <p class="label">{message(props.locale, 'answer')}</p>
      <p class="answer-text">{props.answers[0]}</p>
    </section>
  )
}

function formatDate(iso: string, locale?: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : new Intl.DateTimeFormat(mediaLocale(locale), { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
}
