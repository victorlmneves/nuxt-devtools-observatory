import { readonly, getCurrentInstance } from 'vue'

export interface FetchEntry {
    id: number | string
    key: string
    url: string
    status: 'pending' | 'ok' | 'error' | 'cached'
    origin: 'ssr' | 'csr'
    startTime: number
    endTime?: number
    ms?: number
    size?: number
    cached: boolean
    payload?: unknown
    error?: unknown
    file?: string
    line?: number
}

interface ObservatoryWindow extends Window {
    __observatory__?: { fetch?: ReturnType<typeof setupFetchRegistry> }
    __NUXT__?: { data?: Record<string, unknown> }
    __nuxt_devtools__?: { channel?: { send: (event: string, data: unknown) => void } }
}

interface FetchResponse extends Response {
    _data?: unknown
}

// The return type of useFetch/useAsyncData — a reactive AsyncData object.
// Typed loosely to avoid importing Nuxt internals; we only read .status and .data.
interface FetchResult {
    status?: { value?: string }
    data?: { value?: unknown }
    [key: string]: unknown
}

interface FetchOptions {
    server?: boolean
    onResponse?: (ctx: { response: FetchResponse }) => void
    onResponseError?: (ctx: { response: FetchResponse }) => void
    [key: string]: unknown
}

interface FetchMeta {
    key: string
    file: string
    line: number
}

/**
 * Sets up the fetch registry, which tracks all fetch requests and their
 * associated metadata (e.g. duration, size, origin).
 * @returns {object} The fetch registry with `register`, `update`, `getAll`, `clear`, and `entries` members.
 */
// Allow configuration via .env or Nuxt runtime config
const MAX_FETCH_ENTRIES =
    typeof process !== 'undefined' && process.env.OBSERVATORY_MAX_FETCH_ENTRIES ? Number(process.env.OBSERVATORY_MAX_FETCH_ENTRIES) : 200
// Maximum payload size to store in memory (10 KB as JSON string)
const MAX_PAYLOAD_BYTES =
    typeof process !== 'undefined' && process.env.OBSERVATORY_MAX_PAYLOAD_BYTES ? Number(process.env.OBSERVATORY_MAX_PAYLOAD_BYTES) : 10_000

/**
 * Truncates a payload to a maximum byte size for safe logging or transport.
 * @param {unknown} payload The data to be truncated.
 * @returns {unknown} The truncated payload, a string if too large, or '[unserializable]' if not serializable.
 */
function truncatePayload(payload: unknown): unknown {
    if (payload === undefined || payload === null) {
        return payload
    }

    try {
        const str = JSON.stringify(payload)
        if (str.length <= MAX_PAYLOAD_BYTES) {
            return JSON.parse(str)
        }

        return str.slice(0, MAX_PAYLOAD_BYTES) + '… (truncated)'
    } catch {
        return '[unserializable]'
    }
}

export function setupFetchRegistry() {
    const entries = new Map<string | number, FetchEntry>()

    let dirty = true // start dirty so first snapshot always builds
    let cachedSnapshot: FetchEntry[] = []

    function markDirty() {
        dirty = true
    }

    function register(entry: FetchEntry) {
        // Evict oldest entry when cap is reached
        if (entries.size >= MAX_FETCH_ENTRIES) {
            const oldestKey = entries.keys().next().value

            if (oldestKey !== undefined) {
                entries.delete(oldestKey)
            }
        }

        const safeEntry = entry.payload !== undefined ? { ...entry, payload: truncatePayload(entry.payload) } : entry
        entries.set(safeEntry.id, safeEntry)
        markDirty()
        emit('fetch:start', safeEntry)
    }

    function update(id: string, patch: Partial<FetchEntry>) {
        const existing = entries.get(id)

        if (!existing) {
            return
        }

        const safePatch = patch.payload !== undefined ? { ...patch, payload: truncatePayload(patch.payload) } : patch
        const updated = { ...existing, ...safePatch }
        entries.set(id, updated)
        markDirty()
        emit('fetch:update', updated)
    }

    function getAll(): FetchEntry[] {
        if (dirty) {
            cachedSnapshot = [...entries.values()]
            dirty = false
        }

        return cachedSnapshot

        // return [...entries.values()]
    }

    function getSnapshot(): FetchEntry[] {
        if (!dirty) {
            return cachedSnapshot
        }

        cachedSnapshot = [...entries.values()] // shallow copy is enough — entries are already plain objects
        dirty = false

        return cachedSnapshot
    }

    function clear() {
        entries.clear()
        markDirty()
        emit('fetch:clear', {})
    }

    function emit(event: string, data: unknown) {
        if (!import.meta.client) {
            return
        }

        const channel = (window as ObservatoryWindow).__nuxt_devtools__?.channel
        channel?.send(event, data)
    }

    return { register, update, getAll, getSnapshot, clear, entries: readonly(entries) }
}

// ── Dev shims called by the Vite transform ────────────────────────────────
export function __devFetchHandler(
    handler: (...args: unknown[]) => unknown,
    key: unknown,
    meta: FetchMeta
): (...args: unknown[]) => Promise<unknown> {
    if (!import.meta.dev || !import.meta.client) {
        return (...args: unknown[]) => Promise.resolve(handler(...args))
    }

    const registry = (window as ObservatoryWindow).__observatory__?.fetch

    if (!registry) {
        return (...args: unknown[]) => Promise.resolve(handler(...args))
    }

    const normalizedKey = typeof key === 'string' ? key : 'useAsyncData'

    // __devFetchHandler is called every time useAsyncData's internal handler
    // executes on the client. It never runs on SSR hydration (process.client
    // guard in the transform prevents it), so every call here is a real CSR
    // execution — either the initial fetch or a refresh().
    //
    // Each invocation gets its own id so refreshes appear as separate rows.
    return (...args: unknown[]) => {
        const id = `${normalizedKey}::${Date.now()}`
        const startTime = performance.now()

        registry.register({
            id,
            key: normalizedKey,
            url: normalizedKey,
            status: 'pending',
            origin: 'csr',
            startTime,
            cached: false,
            file: meta.file,
            line: meta.line,
        })

        return Promise.resolve(handler(...args))
            .then((result) => {
                const endTime = performance.now()
                registry.update(id, {
                    status: 'ok',
                    endTime,
                    ms: Math.round(endTime - startTime),
                    payload: result,
                })

                return result
            })
            .catch((error: unknown) => {
                const endTime = performance.now()
                registry.update(id, {
                    status: 'error',
                    endTime,
                    ms: Math.round(endTime - startTime),
                    error,
                })

                throw error
            })
    }
}

export function __devFetchCall(
    originalFn: (url: string, opts: FetchOptions) => FetchResult,
    url: string,
    opts: FetchOptions,
    meta: FetchMeta
): FetchResult {
    if (!import.meta.dev || !import.meta.client) {
        return originalFn(url, opts)
    }

    const registry = (window as ObservatoryWindow).__observatory__?.fetch

    if (!registry) {
        return originalFn(url, opts)
    }

    // Resolve Vue refs and getter functions for url
    function resolveUrl(u: unknown): string {
        if (u && typeof u === 'object' && 'value' in u) {
            return resolveUrl((u as { value: unknown }).value)
        }

        if (typeof u === 'function') {
            try {
                return resolveUrl((u as () => unknown)())
            } catch {
                return String(u)
            }
        }

        return typeof u === 'string' ? u : String(u)
    }

    const id = `${meta.key}::${Date.now()}`
    const startTime = performance.now()
    const resolvedUrl = resolveUrl(url)

    // When useFetch is called outside a component's setup() context (e.g. inside a
    // click handler), Nuxt warns and its deduplication machinery becomes unreliable:
    // hooks from a prior call's closure fire instead of ours, so entries stay pending.
    //
    // Detect this with getCurrentInstance() — returns null outside setup().
    // When outside setup: let useFetch run untouched, but track the request via a
    // parallel native fetch() call whose promise we fully control.
    if (getCurrentInstance() === null) {
        registry.register({
            id,
            key: meta.key,
            url: resolvedUrl,
            status: 'pending',
            origin: 'csr',
            startTime,
            cached: false,
            file: meta.file,
            line: meta.line,
        })

        fetch(resolvedUrl)
            .then(async (r) => {
                const endTime = performance.now()
                const size = Number(r.headers.get('content-length')) || undefined

                // Clone before reading body so the original response stream is untouched
                let payload: unknown

                try {
                    payload = await r.clone().json()
                } catch {
                    // Not JSON (e.g. HTML error page) — leave payload undefined
                }

                registry.update(id, {
                    status: r.ok ? 'ok' : 'error',
                    endTime,
                    ms: Math.round(endTime - startTime),
                    size,
                    payload,
                })
            })
            .catch(() => {
                const endTime = performance.now()
                registry.update(id, { status: 'error', endTime, ms: Math.round(endTime - startTime) })
            })

        return originalFn(url, opts)
    }

    // Track how many times onResponse has fired for this entry in this closure.
    // - 0 fires: initial fetch not yet responded
    // - 1st fire: initial HTTP response
    // - 2nd+ fire: refresh() was called → treat as re-fetch
    // Using a counter avoids looking up the registry inside the hook (the entry
    // may not exist yet when the first onResponse fires for a CSR fetch, since
    // register() runs after originalFn() returns).
    let responseCount = 0
    let lastCallStart = startTime
    // Set to true after we confirm the entry was registered as SSR-cached.
    // When true, ANY onResponse is a refresh (no initial CSR response to update),
    // so every response should add a new row rather than overwrite the cached entry.
    let initialWasSsr = false

    // Call useFetch first so Nuxt can hydrate from SSR payload synchronously.
    const result = originalFn(url, {
        ...opts,
        onRequest() {
            lastCallStart = performance.now()

            if (typeof opts.onRequest === 'function') {
                ;(opts.onRequest as () => void)()
            }
        },
        onResponse({ response }: { response: FetchResponse }) {
            responseCount++
            const endTime = performance.now()
            const ms = Math.round(endTime - lastCallStart)
            const size = Number(response.headers?.get('content-length')) || undefined
            const cached = response.headers?.get('x-nuxt-cache') === 'HIT'
            const status = cached ? 'cached' : response.ok ? 'ok' : ('error' as const)

            if (responseCount === 1 && !initialWasSsr) {
                // First HTTP response for a CSR fetch — update the pending entry.
                registry.update(id, { status, endTime, ms, size, cached, payload: response._data })
            } else {
                // Either:
                //   a) refresh() was called on a CSR entry (responseCount > 1), or
                //   b) refresh() was called on an SSR-cached entry (initialWasSsr, any count)
                // Either way: add a new row so the original entry is preserved.
                registry.register({
                    id: `${id}::refresh::${responseCount}`,
                    key: meta.key,
                    url: resolvedUrl,
                    status,
                    origin: 'csr',
                    startTime: lastCallStart,
                    endTime,
                    ms,
                    size,
                    cached,
                    payload: response._data,
                    file: meta.file,
                    line: meta.line,
                })
            }

            if (typeof opts.onResponse === 'function') {
                opts.onResponse({ response })
            }
        },
        onResponseError({ response }: { response: FetchResponse }) {
            const endTime = performance.now()
            const ms = Math.round(endTime - lastCallStart)

            // Record error status whether or not onResponse already fired.
            // When both hooks fire (normal HTTP error flow), this is a harmless
            // update since the entry is already 'error'.
            registry.update(id, { status: 'error', endTime, ms })

            if (typeof opts.onResponseError === 'function') {
                opts.onResponseError({ response })
            }
        },
    })

    // After useFetch returns, inspect result.status.value to decide how to register:
    //
    //   'success' → Nuxt hydrated synchronously from SSR payload — no HTTP request
    //               will be made, onResponse never fires → register as cached/ssr
    //
    //   'error'   → useFetch returned a DEDUPLICATED prior error (Nuxt caches
    //               AsyncData by its internal hash key). No new HTTP request is
    //               made, onResponse never fires → register as error immediately
    //
    //   'pending' → either a real HTTP fetch is in progress (onResponse will fire),
    //               OR this call is deduplicated against an in-flight request from
    //               a prior call (onResponse fires on that prior call's closure,
    //               NOT ours). Use result.then() to catch the second case: if our
    //               entry is still 'pending' when the shared AsyncData settles,
    //               update it from result.status / result.error.
    //
    // NOTE: window.__NUXT__.data key-matching cannot be used here — Nuxt stores SSR
    // data under a hash (e.g. '$fi9hmbe'), not the URL slug in meta.key, so lookups
    // always miss and every fetch incorrectly appears as CSR pending.
    const statusValue = result?.status?.value
    const isSsrHydrated = statusValue === 'success'
    const isDeduplicatedError = statusValue === 'error'

    registry.register({
        id,
        key: meta.key,
        url: resolvedUrl,
        status: isSsrHydrated ? 'cached' : isDeduplicatedError ? 'error' : 'pending',
        origin: isSsrHydrated ? 'ssr' : 'csr',
        startTime,
        endTime: isSsrHydrated || isDeduplicatedError ? startTime : undefined,
        ms: isSsrHydrated || isDeduplicatedError ? 0 : undefined,
        cached: isSsrHydrated,
        payload: isSsrHydrated ? result?.data?.value : undefined,
        file: meta.file,
        line: meta.line,
    })

    // Now that we know whether this was SSR, tell the onResponse closure.
    // Any HTTP response that fires after this point is a refresh(), not the
    // initial fetch completing — so it should always add a new row.
    if (isSsrHydrated) {
        initialWasSsr = true
    }

    // For pending entries that are deduplicated against an in-flight request:
    // onResponse fires on the *original* call's closure, not ours, so our entry
    // would stay 'pending' forever. result.then() resolves when the shared
    // AsyncData settles (success or error), giving us a reliable fallback hook.
    // We only act if the entry is still 'pending' at that point — if onResponse
    // already updated it (normal CSR flow), we leave it alone.
    if (!isSsrHydrated && !isDeduplicatedError && typeof result?.then === 'function') {
        result
            .then(() => {
                const endTime = performance.now()
                const existing = registry.getAll().find((e) => e.id === id)

                // Only update if still pending — onResponse already handled it otherwise
                if (existing?.status === 'pending') {
                    const settled = result?.status?.value
                    registry.update(id, {
                        status: settled === 'success' ? 'ok' : 'error',
                        endTime,
                        ms: Math.round(endTime - startTime),
                        payload: settled === 'success' ? result?.data?.value : undefined,
                    })
                }
            })
            .catch(() => {
                // Swallow — the update above handles error state via status check
            })
    }

    return result
}
