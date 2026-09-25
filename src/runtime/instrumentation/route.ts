import type { NuxtApp } from '#app'
import { getCurrentTraceId, setCurrentTraceId } from '../tracing/context'
import { startSpan } from '../tracing/tracing'
import { traceStore } from '../tracing/traceStore'

export interface IRouteInstrumentationOptions {
    getCurrentPath: () => string
    carrier?: object
}

export function setupRouteInstrumentation(nuxtApp: NuxtApp, options: IRouteInstrumentationOptions) {
    let activeTraceId: string | undefined

    const getRoutePath = () => {
        const path = options.getCurrentPath()

        return path && path.length > 0 ? path : '/'
    }

    nuxtApp.hook('page:start', () => {
        // Avoid leaving a trace open when a navigation is interrupted.
        if (activeTraceId) {
            startSpan({
                name: 'navigation:abort',
                type: 'navigation',
                traceId: activeTraceId,
                metadata: {
                    reason: 'superseded',
                    route: getRoutePath(),
                },
            }).end({ status: 'cancelled' })

            traceStore.endTrace(activeTraceId, { status: 'cancelled' })
            activeTraceId = undefined
        }

        const route = getRoutePath()
        const previousRoute = getCurrentTraceId(options.carrier as never)
        const trace = traceStore.createTrace({
            name: `route:${route}`,
            metadata: {
                kind: 'route-navigation',
                route,
                previousTraceId: previousRoute,
            },
        })

        activeTraceId = trace.id
        setCurrentTraceId(trace.id, options.carrier as never)
    })

    nuxtApp.hook('page:finish', () => {
        if (!activeTraceId) {
            return
        }

        const route = getRoutePath()
        const trace = traceStore.getTrace(activeTraceId)
        const status =
            trace?.status === 'error' || trace?.spans.some((span) => span.status === 'error' || span.type === 'error') ? 'error' : 'ok'

        traceStore.endTrace(activeTraceId, {
            status,
            metadata: {
                route,
            },
        })

        setCurrentTraceId(undefined, options.carrier as never)
        activeTraceId = undefined
    })
}
