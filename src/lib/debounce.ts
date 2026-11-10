import { type Accessor, createEffect, createSignal, on, onCleanup } from 'solid-js'

/** Trailing-edge debounced mirror of a signal. */
export function createDebounced<T>(source: Accessor<T>, ms: number): Accessor<T> {
  const [value, setValue] = createSignal(source())
  createEffect(
    on(
      source,
      next => {
        const id = setTimeout(() => setValue(() => next), ms)
        onCleanup(() => clearTimeout(id))
      },
      { defer: true },
    ),
  )
  return value
}
