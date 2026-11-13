import { createSignal, type JSX, onMount, Show } from 'solid-js'

/** Live admin panels poll the server; rendering them on the server only risks hydration mismatches. */
export function ClientOnly(props: { children: JSX.Element }) {
  const [mounted, setMounted] = createSignal(false)
  onMount(() => setMounted(true))
  return <Show when={mounted()}>{props.children}</Show>
}
