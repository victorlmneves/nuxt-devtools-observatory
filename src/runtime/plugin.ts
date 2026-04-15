import { defineNuxtPlugin, useNuxtApp, useRuntimeConfig, useRouter } from '#app'
import { nextTick } from 'vue'
import { setupComposableRegistry } from './composables/composable-registry'
import { setupFetchRegistry } from './composables/fetch-registry'
import { setupProvideInjectRegistry } from './composables/provide-inject-registry'
import { setupRenderRegistry } from './composables/render-registry'
import { setupTransitionRegistry } from './composables/transition-registry'
import { setupComponentInstrumentation } from './instrumentation/component'
import { setupFetchInstrumentation } from './instrumentation/fetch'
import { setupRouteInstrumentation } from './instrumentation/route'
import { traceStore } from './tracing/traceStore'
import type { ObservatoryCommand, ObservatorySnapshot } from '../types/rpc'

interface ObservatoryWindow extends Window {
    __observatory__?: Record<string, unknown>
}

export default defineNuxtPlugin(() => {
    if (!import.meta.dev) {
        return
    }

    const nuxtApp = useNuxtApp()

    const config = useRuntimeConfig().public.observatory as {
        heatmapThresholdCount: number
        heatmapThresholdTime: number
        debugRpc?: boolean
        composableNavigationMode?: 'route' | 'session'
        fetchDashboard?: boolean
        provideInjectGraph?: boolean
        composableTracker?: boolean
        renderHeatmap?: boolean
        transitionTracker?: boolean
        traceViewer?: boolean
        heatmapHideInternals?: boolean
    }

    const debugRpc = config.debugRpc === true
    const debugLog = (...args: unknown[]) => {
        if (debugRpc) {
            // eslint-disable-next-line no-console
            console.info('[observatory][rpc][host]', ...args)
        }
    }

    let composableNavigationMode: 'route' | 'session' = config.composableNavigationMode === 'session' ? 'session' : 'route'
    let heartbeatId: number | null = null
    let lastSnapshotSignature = ''

    // Enable Vue performance API for render heatmap if enabled
    if (config.renderHeatmap) {
        nuxtApp.vueApp.config.performance = true
    }

    // Only initialize registries for enabled features
    const registries: Record<string, unknown> = {}

    if (config.fetchDashboard) {
        registries.fetch = setupFetchRegistry()
    }

    if (config.provideInjectGraph) {
        registries.provideInject = setupProvideInjectRegistry()
    }

    if (config.composableTracker) {
        registries.composable = setupComposableRegistry()
    }

    if (config.renderHeatmap) {
        registries.render = setupRenderRegistry(nuxtApp, {
            isHydrating: () => (nuxtApp.isHydrating ?? false) && (nuxtApp.payload as { serverRendered?: boolean })?.serverRendered === true,
        })
    }

    if (config.transitionTracker) {
        registries.transition = setupTransitionRegistry()
    }

    // Read the SSR trace injected by the Nitro plugin and merge its spans into
    // the client traceStore so the Trace Viewer shows an `ssr:` prefixed trace
    // for the initial page load alongside the subsequent client navigations.
    function mergeSsrSpans() {
        if (!import.meta.client) {
            return
        }

        const el = document.getElementById('__observatory_ssr_spans__')

        if (!el) {
            return
        }

        let record: {
            traceId: string
            name: string
            spans: Array<{
                id: string
                name: string
                type: string
                startTime: number
                endTime?: number
                durationMs?: number
                status: 'ok' | 'error' | 'active'
                metadata?: Record<string, unknown>
            }>
        }

        try {
            record = JSON.parse(el.textContent ?? '')
        } catch {
            return
        }

        if (!record?.traceId || !Array.isArray(record.spans)) {
            return
        }

        // Anchor the SSR trace just before now so it appears at the top of the
        // trace list (most recent). Span times are relative to request start
        // (startTime: 0 = request began), so we compute an absolute base by
        // subtracting the navigation span duration from performance.now().
        const navDurationMs = record.spans[0]?.durationMs ?? 0
        const traceStartTime = performance.now() - navDurationMs

        traceStore.createTrace({
            id: record.traceId,
            name: record.name,
            startTime: traceStartTime,
            metadata: { origin: 'ssr' },
        })

        for (const span of record.spans) {
            traceStore.addSpan({
                id: span.id,
                traceId: record.traceId,
                name: span.name,
                type: span.type,
                startTime: traceStartTime + span.startTime,
                endTime: span.endTime !== undefined ? traceStartTime + span.endTime : undefined,
                status: span.status,
                metadata: { ...(span.metadata ?? {}), origin: 'ssr' },
            })
        }

        traceStore.endTrace(record.traceId, {
            endTime: traceStartTime + navDurationMs,
            status: 'ok',
            metadata: { origin: 'ssr' },
        })
    }

    // Expose registries globally so Vite transform shims can reach them.
    // This must happen synchronously — before any component setup() runs —
    // so that shims injected by the Vite transforms find the registry already
    // in place rather than silently no-opping on the first render.
    if (import.meta.client) {
        if (config.traceViewer) {
            setupComponentInstrumentation(nuxtApp)
            setupFetchInstrumentation(nuxtApp, registries.fetch as Parameters<typeof setupFetchInstrumentation>[1])
            // Pick up SSR spans injected into the HTML by the Nitro plugin and
            // merge them into the client traceStore as a standalone SSR trace.
            mergeSsrSpans()
        } else if (config.fetchDashboard) {
            setupFetchInstrumentation(nuxtApp, registries.fetch as Parameters<typeof setupFetchInstrumentation>[1])
        }

        // Always clear any previous registry to avoid cross-project state
        delete (window as ObservatoryWindow).__observatory__
        ;(window as ObservatoryWindow).__observatory__ = registries

        const composableRegistry = registries.composable as ReturnType<typeof setupComposableRegistry> | undefined

        if (composableRegistry && composableRegistry.onComposableChange) {
            composableRegistry.onComposableChange(() => {
                broadcastAll('composable:onChange')
            })
        }

        // Receive commands from the server-side RPC handlers.
        import.meta.hot?.on('observatory:command', (rawPayload: unknown) => {
            if (!rawPayload || typeof rawPayload !== 'object') {
                return
            }

            const payload = rawPayload as ObservatoryCommand

            if (payload.cmd === 'request-snapshot') {
                debugLog('received command: request-snapshot')
                broadcastAll('command:request-snapshot')

                return
            }

            if (payload.cmd === 'clear-composables') {
                debugLog('received command: clear-composables')

                if (composableRegistry) {
                    if (composableNavigationMode === 'session') {
                        composableRegistry.clearNonLayout()
                    } else {
                        composableRegistry.clear()
                    }
                }

                broadcastAll('command:clear-composables')

                return
            }

            if (payload.cmd === 'set-mode') {
                debugLog('received command: set-mode', payload.mode)

                if (payload.mode === 'route' || payload.mode === 'session') {
                    composableNavigationMode = payload.mode
                }

                broadcastAll('command:set-mode')

                return
            }

            if (payload.cmd === 'edit-composable') {
                debugLog('received command: edit-composable', { id: payload.id, key: payload.key })

                composableRegistry?.editValue(payload.id, payload.key, payload.value)
            }
        })

        nuxtApp.hook('app:beforeUnmount', () => {
            import.meta.hot?.off('observatory:command')

            if (heartbeatId !== null) {
                window.clearInterval(heartbeatId)
                heartbeatId = null
            }
        })
    }

    // Broadcast all registry data when devtools tab connects
    nuxtApp.hook('app:mounted', () => {
        broadcastAll('app:mounted')

        nextTick(() => {
            broadcastAll('app:mounted:nextTick')
        })

        setTimeout(() => {
            broadcastAll('app:mounted:50ms')
        }, 50)

        setTimeout(() => {
            broadcastAll('app:mounted:250ms')
        }, 250)

        // Heartbeat fallback: some trackers (fetch/provide/render/transition)
        // don't currently emit a direct callback into this plugin. Poll the
        // aggregated snapshot and only broadcast when the payload changed.
        if (import.meta.client && heartbeatId === null) {
            heartbeatId = window.setInterval(() => {
                const snapshot = buildSnapshot()
                const signature = JSON.stringify(snapshot)

                if (signature !== lastSnapshotSignature) {
                    lastSnapshotSignature = signature
                    debugLog('heartbeat detected snapshot change')
                    import.meta.hot?.send('observatory:snapshot', snapshot)
                }
            }, 400)
        }
    })

    nuxtApp.hook('page:finish', () => {
        broadcastAll('page:finish')
    })

    if (import.meta.client) {
        const router = useRouter()

        if (config.traceViewer) {
            setupRouteInstrumentation(nuxtApp, {
                getCurrentPath: () => router.currentRoute.value.path ?? '/',
            })
        }

        // router.beforeEach fires BEFORE Vue renders anything for the new route —
        // no new setup() has run yet, so clearing here is safe and race-free.
        // page:start (Suspense.onPending) fires AFTER synchronous setup() runs,
        // which causes clear() to wipe entries that were just registered.
        router.beforeEach(
            (_to: ReturnType<typeof useRouter>['currentRoute']['value'], from: ReturnType<typeof useRouter>['currentRoute']['value']) => {
                if (!from || from.name === undefined) {
                    return
                }

                const render = registries.render as unknown

                if (render && typeof (render as { reset?: () => void }).reset === 'function') {
                    ;(render as { reset: () => void }).reset()
                }

                const provideInject = registries.provideInject as unknown

                if (provideInject && typeof (provideInject as { clear?: () => void }).clear === 'function') {
                    ;(provideInject as { clear: () => void }).clear()
                }

                const composable = registries.composable as unknown

                if (
                    composableNavigationMode === 'route' &&
                    composable &&
                    typeof (composable as { clearNonLayout?: () => void }).clearNonLayout === 'function'
                ) {
                    ;(composable as { clearNonLayout: () => void }).clearNonLayout()
                }

                const transition = registries.transition as unknown

                if (transition && typeof (transition as { clear?: () => void }).clear === 'function') {
                    ;(transition as { clear: () => void }).clear()
                }
            }
        )

        // afterEach fires after the new route is fully committed and rendered.
        // Use nextTick so persistent component updated() hooks have flushed
        // before we broadcast — otherwise rerenders shows 0 on navigation.
        router.afterEach((to: ReturnType<typeof useRouter>['currentRoute']['value']) => {
            const composable = registries.composable as unknown

            if (composable && typeof (composable as { setRoute?: (path: string) => void }).setRoute === 'function') {
                ;(composable as { setRoute: (path: string) => void }).setRoute(to.path ?? '/')
            }

            const render = registries.render as unknown

            if (render && typeof (render as { setRoute?: (path: string) => void }).setRoute === 'function') {
                ;(render as { setRoute: (path: string) => void }).setRoute(to.path ?? '/')
            }

            nextTick(() => broadcastAll('router:afterEach'))
        })
    }

    function broadcastAll(reason = 'unknown') {
        if (!import.meta.client) {
            return
        }

        if (!import.meta.hot) {
            return
        }

        const snapshot = buildSnapshot()

        debugLog('push snapshot', {
            reason,
            fetch: Array.isArray(snapshot.fetch) ? snapshot.fetch.length : 0,
            composables: Array.isArray(snapshot.composables) ? snapshot.composables.length : 0,
            renders: Array.isArray(snapshot.renders) ? snapshot.renders.length : 0,
            transitions: Array.isArray(snapshot.transitions) ? snapshot.transitions.length : 0,
            traces: Array.isArray(snapshot.traces) ? snapshot.traces.length : 0,
        })

        lastSnapshotSignature = JSON.stringify(snapshot)
        import.meta.hot.send('observatory:snapshot', snapshot)
    }

    function buildSnapshot(): ObservatorySnapshot {
        // Always return a consistent object with all tracker keys present.
        function safeParse<T>(val: unknown, fallback: T): T {
            if (typeof val === 'string') {
                try {
                    return JSON.parse(val) as T
                } catch {
                    return fallback
                }
            }

            if (val && typeof val === 'object') {
                return val as T
            }

            return fallback
        }

        // Define the expected tracker keys and their fallbacks
        const trackerDefs = [
            { key: 'fetch', fallback: [] },
            { key: 'provideInject', fallback: { provides: [], injects: [] } },
            { key: 'composable', fallback: [] },
            { key: 'render', fallback: {} },
            { key: 'transition', fallback: {} },
        ] as const

        const snapshot: Record<string, unknown> = {}

        for (const { key, fallback } of trackerDefs) {
            const reg = registries[key] as unknown
            const hasGetSnapshot = reg && typeof (reg as { getSnapshot?: () => unknown }).getSnapshot === 'function'
            snapshot[key === 'composable' ? 'composables' : key === 'render' ? 'renders' : key === 'transition' ? 'transitions' : key] =
                hasGetSnapshot ? safeParse((reg as { getSnapshot: () => unknown }).getSnapshot(), fallback) : fallback
        }

        snapshot.traces = config.traceViewer
            ? traceStore.getAllTraces().map((trace) => ({
                  id: trace.id,
                  name: trace.name,
                  startTime: trace.startTime,
                  endTime: trace.endTime,
                  durationMs: trace.durationMs,
                  status: trace.status,
                  metadata: trace.metadata,
                  spans: trace.spans.map((span) => ({
                      id: span.id,
                      traceId: span.traceId,
                      parentSpanId: span.parentSpanId,
                      name: span.name,
                      type: span.type,
                      startTime: span.startTime,
                      endTime: span.endTime,
                      durationMs: span.durationMs,
                      status: span.status,
                      metadata: span.metadata,
                  })),
              }))
            : []

        snapshot.features = {
            fetchDashboard: !!registries.fetch,
            provideInjectGraph: !!registries.provideInject,
            composableTracker: !!registries.composable,
            composableNavigationMode,
            renderHeatmap: !!registries.render,
            transitionTracker: !!registries.transition,
            traceViewer: !!config.traceViewer,
        }

        return snapshot as ObservatorySnapshot
    }
})
