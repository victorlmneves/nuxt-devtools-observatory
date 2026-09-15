import type { NuxtApp } from '#app'
import { startSpan } from '../tracing/tracing'
import { getCurrentTraceId } from '../tracing/context'
import { traceStore } from '../tracing/traceStore'

type ErrorLike = {
    message?: unknown
    stack?: unknown
    name?: unknown
    statusCode?: unknown
}

function asMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }

    if (error && typeof error === 'object' && 'message' in (error as ErrorLike)) {
        const message = (error as ErrorLike).message

        if (typeof message === 'string' && message.length > 0) {
            return message
        }
    }

    return String(error ?? 'unknown error')
}

function asStack(error: unknown): string | undefined {
    if (error instanceof Error && typeof error.stack === 'string') {
        return error.stack
    }

    if (error && typeof error === 'object' && typeof (error as ErrorLike).stack === 'string') {
        return (error as ErrorLike).stack as string
    }

    return undefined
}

function asName(error: unknown): string | undefined {
    if (error instanceof Error && error.name) {
        return error.name
    }

    if (error && typeof error === 'object' && typeof (error as ErrorLike).name === 'string') {
        return (error as ErrorLike).name as string
    }

    return undefined
}

function asStatusCode(error: unknown): number | undefined {
    if (error && typeof error === 'object' && typeof (error as ErrorLike).statusCode === 'number') {
        return (error as ErrorLike).statusCode as number
    }

    return undefined
}

function componentName(instance: unknown): string | undefined {
    if (!instance || typeof instance !== 'object') {
        return undefined
    }

    const typed = instance as {
        type?: { __name?: string; name?: string }
        $options?: { name?: string }
    }

    return typed.type?.__name || typed.type?.name || typed.$options?.name
}

export function recordErrorSpan(source: 'vue' | 'app' | 'navigation', error: unknown, extra: Record<string, unknown> = {}) {
    const message = asMessage(error)
    const metadata = {
        source,
        message,
        name: asName(error),
        stack: asStack(error),
        statusCode: asStatusCode(error),
        ...extra,
    }

    const span = startSpan({
        name: `error:${source}`,
        type: 'error',
        metadata: {
            ...metadata,
            status: 'error',
        },
    })

    span.end({
        status: 'error',
        metadata: {
            ...metadata,
            status: 'error',
        },
    })

    const traceId = getCurrentTraceId()
    const trace = traceId ? traceStore.getTrace(traceId) : undefined

    if (trace && trace.status === 'active') {
        trace.status = 'error'
        trace.metadata = { ...(trace.metadata ?? {}), hasError: true, errorSource: source }
    }

    return span.span
}

export function setupErrorInstrumentation(nuxtApp: NuxtApp) {
    nuxtApp.hook('vue:error', (...args: unknown[]) => {
        const error = args[0]
        const instance = args[1]
        const info = args[2]

        recordErrorSpan('vue', error, {
            info: typeof info === 'string' ? info : undefined,
            component: componentName(instance),
        })
    })

    nuxtApp.hook('app:error', (...args: unknown[]) => {
        recordErrorSpan('app', args[0])
    })

    const router = (nuxtApp as { $router?: { onError?: (handler: (error: unknown) => void) => void } }).$router

    if (typeof router?.onError === 'function') {
        router.onError((error: unknown) => {
            recordErrorSpan('navigation', error)
        })
    }
}
