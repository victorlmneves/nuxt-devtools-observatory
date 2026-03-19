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

/**
 * Sets up the fetch registry, which tracks all fetch requests and their
 * associated metadata (e.g. duration, size, origin).
 * @returns {object} The fetch registry with `register`, `update`, `getAll`, `clear`, and `entries` members.
 */
export function setupFetchRegistry() {
    const entries = ref<Map<string, FetchEntry>>(new Map())

    function register(entry: FetchEntry) {
        entries.value.set(entry.id, entry)
        emit('fetch:start', entry)
    }

    function update(id: string, patch: Partial<FetchEntry>) {
        const existing = entries.value.get(id)

        if (!existing) {
            return
        }

        const updated = { ...existing, ...patch }
        entries.value.set(id, updated)
        emit('fetch:update', updated)
    }

    function safeValue(val: unknown): unknown {
        // Try to JSON.stringify, fallback to string or undefined
        if (val === undefined || val === null) {
            return val
        }

        if (typeof val === 'function') {
            return undefined
        }

        if (typeof val === 'object') {
            try {
                return JSON.parse(JSON.stringify(val))
            } catch {
                return String(val)
            }
        }

        return val
    }

    function sanitize(entry: FetchEntry): FetchEntry {
        return {
            id: entry.id,
            key: entry.key,
            url: entry.url,
            status: entry.status,
            origin: entry.origin,
            startTime: entry.startTime,
            endTime: entry.endTime,
            ms: entry.ms,
            size: entry.size,
            cached: entry.cached,
            payload: safeValue(entry.payload),
            error: safeValue(entry.error),
            file: entry.file,
            line: entry.line,
        }
    }

    function getAll(): FetchEntry[] {
        return [...entries.value.values()].map(sanitize)
    }

    function clear() {
        entries.value.clear()
        emit('fetch:clear', {})
    }

    function emit(event: string, data: unknown) {
        if (!import.meta.client) {
            return
        }

        const channel = (window as Window & { __nuxt_devtools__?: { channel?: { send: (event: string, data: unknown) => void } } })
            .__nuxt_devtools__?.channel
        channel?.send(event, data)
    }

    return { register, update, getAll, clear, entries: readonly(entries) }
}

// ── Dev shim called by the Vite transform ─────────────────────────────────
// This function is injected at call sites: __devFetch(url, opts, meta)
export function __devFetch(
    originalFn: (...args: unknown[]) => unknown,
    arg1: ((...args: unknown[]) => unknown) | string,
    arg2: Record<string, unknown>,
    meta: { key: string; file: string; line: number }
) {
    if (!import.meta.dev || !import.meta.client) {
        // Pass through for all signatures
        return typeof arg1 === 'function' ? originalFn(arg1, arg2) : originalFn(arg1, arg2)
    }

    const registry = (window as Window & { __observatory__?: { fetch?: ReturnType<typeof setupFetchRegistry> } }).__observatory__?.fetch

    if (!registry) {
        return typeof arg1 === 'function' ? originalFn(arg1, arg2) : originalFn(arg1, arg2)
    }

    // Detect useAsyncData signature: first arg is a function (handler)
    if (typeof arg1 === 'function') {
        // useAsyncData(handler, opts, meta)
        const handler = arg1 as (...args: unknown[]) => unknown
        // const opts = arg2 || {} // not used in this branch

        return function wrappedHandler(...handlerArgs: unknown[]): Promise<unknown> {
            const id = `${meta.key}::${Date.now()}`
            const startTime = performance.now()
            const origin: 'ssr' | 'csr' = import.meta.server ? 'ssr' : 'csr'
            registry.register({
                id,
                key: meta.key,
                url: meta.key, // No URL in useAsyncData, use key as identifier
                status: 'pending',
                origin,
                startTime,
                cached: false,
                file: meta.file,
                line: meta.line,
            })

            // Call the original handler and track result
            return Promise.resolve(handler(...handlerArgs))
                .then((result: unknown) => {
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
    } else {
        // useFetch(url, opts, meta)
        const url = arg1 as string
        const opts = arg2 || {}
        const id = `${meta.key}::${Date.now()}`
        const startTime = performance.now()
        const origin: 'ssr' | 'csr' = import.meta.server ? 'ssr' : 'csr'
        registry.register({
            id,
            key: meta.key,
            url: typeof url === 'string' ? url : String(url),
            status: 'pending',
            origin,
            startTime,
            cached: false,
            file: meta.file,
            line: meta.line,
        })

        return originalFn(url, {
            ...opts,
            onResponse({ response }: { response: Response }) {
                const ms = Math.round(performance.now() - startTime)
                const size = Number(response.headers?.get('content-length')) || undefined
                const cached = response.headers?.get('x-nuxt-cache') === 'HIT'
                registry.update(id, {
                    status: response.ok ? 'ok' : 'error',
                    endTime: performance.now(),
                    ms,
                    size,
                    cached,
                })

                if (typeof opts.onResponse === 'function') {
                    opts.onResponse({ response })
                }
            },
            onResponseError({ response }: { response: Response }) {
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
}
