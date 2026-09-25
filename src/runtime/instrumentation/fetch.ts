import type { NuxtApp } from '#app'
import { startSpan } from '../tracing/tracing'
import type { FetchEntry } from '../composables/fetch-registry'
import { isNestedFetchSuppressed, isObservatoryTrackedFetch } from './fetch-dedup'

type FetchRegistry = {
    register: (entry: FetchEntry) => void
    update: (id: string, patch: Partial<FetchEntry>) => void
}

type FetchLike = ((request: unknown, options?: Record<string, unknown>) => Promise<unknown>) & {
    raw?: (...args: unknown[]) => Promise<unknown>
    create?: (...args: unknown[]) => unknown
    native?: unknown
}

interface FetchErrorShape {
    response?: {
        status?: number
    }
    statusCode?: number
    status?: number
}

function resolveUrl(input: unknown): string {
    if (typeof input === 'string') {
        return input
    }

    if (input && typeof input === 'object' && 'url' in (input as Record<string, unknown>)) {
        const maybeUrl = (input as { url?: unknown }).url

        return typeof maybeUrl === 'string' ? maybeUrl : String(maybeUrl ?? '')
    }

    return String(input ?? '')
}

function resolveMethod(input: unknown, options?: Record<string, unknown>): string {
    const method = options?.method

    if (typeof method === 'string' && method.length > 0) {
        return method.toUpperCase()
    }

    if (input && typeof input === 'object' && 'method' in (input as Record<string, unknown>)) {
        const requestMethod = (input as { method?: unknown }).method

        if (typeof requestMethod === 'string' && requestMethod.length > 0) {
            return requestMethod.toUpperCase()
        }
    }

    return 'GET'
}

function resolveErrorStatus(error: unknown): number | undefined {
    const target = error as FetchErrorShape | undefined

    return target?.response?.status ?? target?.statusCode ?? target?.status
}

function estimateSize(payload: unknown): number | undefined {
    if (payload === undefined || payload === null) {
        return undefined
    }

    try {
        return JSON.stringify(payload).length
    } catch {
        return undefined
    }
}

function resolvePayload(result: unknown, viaRaw: boolean): unknown {
    if (!viaRaw) {
        return result
    }

    if (result && typeof result === 'object' && '_data' in (result as Record<string, unknown>)) {
        return (result as { _data?: unknown })._data
    }

    return undefined
}

const WRAPPED_FETCH_FLAG = '__observatory_wrapped_fetch__'

function isObservatoryNitroTimelineUrl(url: string) {
    return url.includes('/__observatory/nitro-timeline')
}

function shouldRecordInDashboard(options?: Record<string, unknown>) {
    return !isNestedFetchSuppressed() && !isObservatoryTrackedFetch(options)
}

function wrapFetchLike(original: FetchLike, fetchRegistry?: FetchRegistry): FetchLike {
    if ((original as FetchLike & { [WRAPPED_FETCH_FLAG]?: boolean })[WRAPPED_FETCH_FLAG]) {
        return original
    }

    function instrumentCall(viaRaw: boolean, request: unknown, options?: Record<string, unknown>) {
        const url = resolveUrl(request)

        if (isObservatoryNitroTimelineUrl(url)) {
            return viaRaw
                ? typeof original.raw === 'function'
                    ? original.raw(request, options)
                    : original(request, options)
                : original(request, options)
        }

        const method = resolveMethod(request, options)
        const startedAt = performance.now()
        const source = viaRaw ? '$fetch.raw' : '$fetch'
        const entryId = `${source}::${Date.now()}::${Math.random().toString(36).slice(2, 7)}`
        const recordDashboard = shouldRecordInDashboard(options)

        const span = startSpan({
            name: '$fetch',
            type: 'fetch',
            metadata: {
                source,
                url,
                method,
                status: 'pending',
            },
        })

        if (recordDashboard) {
            fetchRegistry?.register({
                id: entryId,
                key: url,
                url,
                status: 'pending',
                origin: 'csr',
                startTime: startedAt,
                cached: false,
                method,
                source,
            })
        }

        const invoked = viaRaw
            ? typeof original.raw === 'function'
                ? original.raw(request, options)
                : original(request, options)
            : original(request, options)

        return Promise.resolve(invoked)
            .then((result) => {
                const durationMs = Math.max(performance.now() - startedAt, 0)
                const rounded = Math.round(durationMs * 10) / 10
                const payload = resolvePayload(result, viaRaw)

                span.end({
                    status: 'ok',
                    metadata: {
                        source,
                        url,
                        method,
                        status: 'ok',
                        durationMs: rounded,
                    },
                })

                if (recordDashboard) {
                    fetchRegistry?.update(entryId, {
                        status: 'ok',
                        endTime: performance.now(),
                        ms: rounded,
                        payload,
                        size: estimateSize(payload),
                    })
                }

                return result
            })
            .catch((error: unknown) => {
                const durationMs = Math.max(performance.now() - startedAt, 0)
                const rounded = Math.round(durationMs * 10) / 10
                const statusCode = resolveErrorStatus(error)

                span.end({
                    status: 'error',
                    metadata: {
                        source,
                        url,
                        method,
                        status: 'error',
                        statusCode,
                        durationMs: rounded,
                    },
                })

                if (recordDashboard) {
                    fetchRegistry?.update(entryId, {
                        status: 'error',
                        endTime: performance.now(),
                        ms: rounded,
                        error,
                    })
                }

                throw error
            })
    }

    const wrapped: FetchLike = ((request: unknown, options?: Record<string, unknown>) => {
        return instrumentCall(false, request, options)
    }) as FetchLike

    Object.assign(wrapped, original)

    if (typeof original.raw === 'function') {
        wrapped.raw = ((request: unknown, options?: Record<string, unknown>) => {
            return instrumentCall(true, request, options)
        }) as FetchLike['raw']
    }

    if (typeof original.create === 'function') {
        wrapped.create = ((...args: unknown[]) => {
            const created = original.create!(...args) as FetchLike

            return wrapFetchLike(created, fetchRegistry)
        }) as FetchLike['create']
    }

    ;(wrapped as FetchLike & { [WRAPPED_FETCH_FLAG]?: boolean })[WRAPPED_FETCH_FLAG] = true

    return wrapped
}

export function setupFetchInstrumentation(nuxtApp: NuxtApp, fetchRegistry?: FetchRegistry) {
    const original = nuxtApp.$fetch as FetchLike | undefined

    if (!original) {
        return
    }

    if ((original as FetchLike & { [WRAPPED_FETCH_FLAG]?: boolean })[WRAPPED_FETCH_FLAG]) {
        return
    }

    const wrapped = wrapFetchLike(original, fetchRegistry)

    nuxtApp.$fetch = wrapped as NuxtApp['$fetch']

    const globalTarget = globalThis as unknown as { $fetch?: FetchLike }

    if (globalTarget.$fetch === original || typeof globalTarget.$fetch !== 'function') {
        globalTarget.$fetch = wrapped
    } else {
        globalTarget.$fetch = wrapFetchLike(globalTarget.$fetch, fetchRegistry)
    }
}
