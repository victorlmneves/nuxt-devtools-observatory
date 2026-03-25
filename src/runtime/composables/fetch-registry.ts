import { ref, readonly } from 'vue'

export interface FetchEntry {
    id: string
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
const MAX_FETCH_ENTRIES = 200
// Maximum payload size to store in memory (10 KB as JSON string)
const MAX_PAYLOAD_BYTES = 10_000

/**
 * Truncates a payload to MAX_PAYLOAD_BYTES to avoid storing large API
 * responses in memory indefinitely.
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
    const entries = ref<Map<string, FetchEntry>>(new Map())

    function register(entry: FetchEntry) {
        // Evict oldest entry when cap is reached
        if (entries.value.size >= MAX_FETCH_ENTRIES) {
            const oldestKey = entries.value.keys().next().value
            if (oldestKey !== undefined) {
                entries.value.delete(oldestKey)
            }
        }

        const safeEntry = entry.payload !== undefined ? { ...entry, payload: truncatePayload(entry.payload) } : entry
        entries.value.set(safeEntry.id, safeEntry)
        emit('fetch:start', safeEntry)
    }

    function update(id: string, patch: Partial<FetchEntry>) {
        const existing = entries.value.get(id)

        if (!existing) {
            return
        }

        const safePatch = patch.payload !== undefined ? { ...patch, payload: truncatePayload(patch.payload) } : patch
        const updated = { ...existing, ...safePatch }
        entries.value.set(id, updated)
        emit('fetch:update', updated)
    }

    function getAll(): FetchEntry[] {
        return [...entries.value.values()]
    }

    function clear() {
        entries.value.clear()
        emit('fetch:clear', {})
    }

    function emit(event: string, data: unknown) {
        if (!import.meta.client) {
            return
        }

        const channel = (window as ObservatoryWindow).__nuxt_devtools__?.channel
        channel?.send(event, data)
    }

    return { register, update, getAll, clear, entries: readonly(entries) }
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
                registry.update(id, {
                    status: 'ok',
                    endTime: performance.now(),
                    ms: Math.round(performance.now() - startTime),
                    payload: result,
                })

                return result
            })
            .catch((error: unknown) => {
                registry.update(id, {
                    status: 'error',
                    endTime: performance.now(),
                    ms: Math.round(performance.now() - startTime),
                    error,
                })

                throw error
            })
    }
}

export function __devFetchCall(
    originalFn: (url: string, opts: FetchOptions) => Promise<unknown>,
    url: string,
    opts: FetchOptions,
    meta: FetchMeta
): Promise<unknown> {
    if (!import.meta.dev || !import.meta.client) {
        return originalFn(url, opts)
    }

    const registry = (window as ObservatoryWindow).__observatory__?.fetch

    if (!registry) {
        return originalFn(url, opts)
    }

    // --- Patch: resolve Vue refs and getter functions for url ---
    // Accepts string, function, or object (possibly a ref)
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
    const payload = (window as ObservatoryWindow).__NUXT__?.data ?? {}
    const fromPayload = Object.prototype.hasOwnProperty.call(payload, meta.key)
    const origin: 'ssr' | 'csr' = fromPayload ? 'ssr' : 'csr'
    const resolvedUrl = resolveUrl(url)

    registry.register({
        id,
        key: meta.key,
        url: resolvedUrl,
        status: fromPayload ? 'cached' : 'pending',
        origin,
        startTime,
        cached: fromPayload,
        payload: fromPayload ? payload[meta.key] : undefined,
        file: meta.file,
        line: meta.line,
    })

    // Patch: SSR cached entries should still attach hooks for re-fetches
    if (fromPayload) {
        // Always attach onResponse/onResponseError hooks to opts for SSR-cached entries
        const optsWithHooks = {
            ...opts,
            onResponse: function (ctx: { response: FetchResponse }) {
                // Update the registry entry payload with the new client response
                const entry = registry.getAll().find((e) => e.id === id)

                if (entry) {
                    registry.update(id, { payload: ctx.response._data })
                }

                if (typeof opts.onResponse === 'function') {
                    opts.onResponse(ctx)
                }
            },
            onResponseError: typeof opts.onResponseError === 'function' ? opts.onResponseError : () => {},
        }

        return originalFn(url, optsWithHooks)
    }

    return originalFn(url, {
        ...opts,
        onResponse({ response }: { response: FetchResponse }) {
            const ms = Math.round(performance.now() - startTime)
            const size = Number(response.headers?.get('content-length')) || undefined
            const cached = response.headers?.get('x-nuxt-cache') === 'HIT'
            registry.update(id, {
                status: cached ? 'cached' : response.ok ? 'ok' : 'error',
                endTime: performance.now(),
                ms,
                size,
                cached,
                payload: response._data,
            })

            if (typeof opts.onResponse === 'function') {
                opts.onResponse({ response })
            }
        },
        onResponseError({ response }: { response: FetchResponse }) {
            registry.update(id, {
                status: 'error',
                endTime: performance.now(),
                ms: Math.round(performance.now() - startTime),
            })

            if (typeof opts.onResponseError === 'function') {
                opts.onResponseError({ response })
            }
        },
    })
}
