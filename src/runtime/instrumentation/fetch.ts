import type { NuxtApp } from '#app'
import { startSpan } from '../tracing/tracing'

type FetchLike = ((request: unknown, options?: Record<string, unknown>) => Promise<unknown>) & {
    raw?: (...args: unknown[]) => Promise<unknown>
    create?: (...args: unknown[]) => unknown
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

const WRAPPED_FETCH_FLAG = '__observatory_wrapped_fetch__'

export function setupFetchInstrumentation(nuxtApp: NuxtApp) {
    const original = nuxtApp.$fetch as FetchLike | undefined

    if (!original) {
        return
    }

    if ((original as FetchLike & { [WRAPPED_FETCH_FLAG]?: boolean })[WRAPPED_FETCH_FLAG]) {
        return
    }

    const wrapped: FetchLike = ((request: unknown, options?: Record<string, unknown>) => {
        const url = resolveUrl(request)
        const method = resolveMethod(request, options)
        const startedAt = performance.now()
        const span = startSpan({
            name: '$fetch',
            type: 'fetch',
            metadata: {
                source: '$fetch',
                url,
                method,
                status: 'pending',
            },
        })

        return Promise.resolve(original(request, options))
            .then((result) => {
                const durationMs = Math.max(performance.now() - startedAt, 0)
                span.end({
                    status: 'ok',
                    metadata: {
                        source: '$fetch',
                        url,
                        method,
                        status: 'ok',
                        durationMs: Math.round(durationMs * 10) / 10,
                    },
                })

                return result
            })
            .catch((error: unknown) => {
                const durationMs = Math.max(performance.now() - startedAt, 0)
                const statusCode = resolveErrorStatus(error)
                span.end({
                    status: 'error',
                    metadata: {
                        source: '$fetch',
                        url,
                        method,
                        status: 'error',
                        statusCode,
                        durationMs: Math.round(durationMs * 10) / 10,
                    },
                })

                throw error
            })
    }) as FetchLike

    Object.assign(wrapped, original)
    ;(wrapped as FetchLike & { [WRAPPED_FETCH_FLAG]?: boolean })[WRAPPED_FETCH_FLAG] = true

    nuxtApp.$fetch = wrapped as NuxtApp['$fetch']

    const globalTarget = globalThis as unknown as { $fetch?: FetchLike }

    if (typeof globalTarget.$fetch === 'function') {
        globalTarget.$fetch = wrapped
    }
}
