import { createSignal, Show } from 'solid-js'

/** Site icon via our own proxy; falls back to a monogram if unavailable. */
export function Favicon(props: { host: string }) {
  const [failed, setFailed] = createSignal(false)
  return (
    <span class="fav" aria-hidden="true">
      <Show when={!failed()} fallback={<span class="fav-mono">{props.host.charAt(0).toUpperCase()}</span>}>
        <img
          src={`/api/favicon?host=${encodeURIComponent(props.host)}`}
          alt=""
          width="16"
          height="16"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </Show>
    </span>
  )
}
