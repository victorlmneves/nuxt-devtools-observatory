import type { NuxtApp } from '#app'
import { getCurrentTraceId, setCurrentTraceId } from '../tracing/context'
import { traceStore } from '../tracing/traceStore'

export interface RouteInstrumentationOptions {
    getCurrentPath: () => string
    carrier?: object
}

export function setupRouteInstrumentation(nuxtApp: NuxtApp, options: RouteInstrumentationOptions) {
    let activeTraceId: string | undefined

    const getRoutePath = () => {
        const path = options.getCurrentPath()

        return path && path.length > 0 ? path : '/'
    }

    nuxtApp.hook('page:start', () => {
        // Avoid leaving a trace open when a navigation is interrupted.
        if (activeTraceId) {
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
        traceStore.endTrace(activeTraceId, {
            status: 'ok',
            metadata: {
                route,
            },
        })

        setCurrentTraceId(undefined, options.carrier as never)
        activeTraceId = undefined
    })
}
