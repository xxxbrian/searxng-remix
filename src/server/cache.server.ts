/** Tiny TTL cache that also de-duplicates concurrent identical requests. */
export class TtlCache<V> {
  readonly #entries = new Map<string, { value: Promise<V>; expires: number }>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxSize = 500,
  ) {}

  get(key: string, load: () => Promise<V>, shouldCache: (value: V) => boolean = () => true): Promise<V> {
    const now = Date.now()
    const hit = this.#entries.get(key)
    if (hit && hit.expires > now) return hit.value

    const value = load()
    const entry = { value, expires: now + this.ttlMs }
    const discard = () => {
      // A slower, expired request must never delete its replacement.
      if (this.#entries.get(key) === entry) this.#entries.delete(key)
    }
    this.#entries.set(key, entry)
    void value.then(result => {
      if (!shouldCache(result)) discard()
    }, discard)
    this.#evict(now)
    return value
  }

  #evict(now: number) {
    if (this.#entries.size <= this.maxSize) return
    for (const [key, { expires }] of this.#entries) {
      if (expires <= now) this.#entries.delete(key)
    }
    // Still full: drop oldest insertions (Map preserves insertion order).
    for (const key of this.#entries.keys()) {
      if (this.#entries.size <= this.maxSize) break
      this.#entries.delete(key)
    }
  }
}

/** The lifetime is an admin setting: keep one cache per distinct value. */
export class TtlCachePool<V> {
  readonly #caches = new Map<number, TtlCache<V>>()

  constructor(private readonly maxSize = 500) {}

  forMinutes(minutes: number): TtlCache<V> {
    let cache = this.#caches.get(minutes)
    if (!cache) {
      cache = new TtlCache<V>(minutes * 60_000, this.maxSize)
      this.#caches.set(minutes, cache)
    }
    return cache
  }
}
