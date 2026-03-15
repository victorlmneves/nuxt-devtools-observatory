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

        const channel = (window as Window & { __nuxt_devtools__?: { channel?: { send: (event: string, data: unknown) => void } } }).__nuxt_devtools__?.channel
        channel?.send(event, data)
    }

    return { register, update, getAll, clear, entries: readonly(entries) }
}

// ── Dev shim called by the Vite transform ─────────────────────────────────
// This function is injected at call sites: __devFetch(url, opts, meta)
export function __devFetch(
    originalFn: (url: string, opts: Record<string, unknown>) => Promise<unknown>,
    url: string,
    opts: Record<string, unknown>,
    meta: { key: string; file: string; line: number }
) {
    if (!import.meta.dev || !import.meta.client) {
        return originalFn(url, opts)
    }

    const registry = (window as Window & { __observatory__?: { fetch?: ReturnType<typeof setupFetchRegistry> } }).__observatory__?.fetch

    if (!registry) {
        return originalFn(url, opts)
    }

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
