import { defineNuxtPlugin, useNuxtApp, useRuntimeConfig, useRouter } from '#app'
import { nextTick } from 'vue'
import { setupComposableRegistry } from './composables/composable-registry'
import { setupFetchRegistry } from './composables/fetch-registry'
import { setupProvideInjectRegistry } from './composables/provide-inject-registry'
import { setupPiniaStoreRegistry } from './composables/pinia-store-registry'
import { setupRenderRegistry } from './composables/render-registry'
import { setupTransitionRegistry } from './composables/transition-registry'
import { setupPayloadRegistry } from './composables/payload-registry'
import { setupStateCookieRegistry } from './composables/state-cookie-registry'
import { setupKeepAliveRegistry } from './composables/keep-alive-registry'
import { setupComponentInstrumentation } from './instrumentation/component'
import { setupFetchInstrumentation } from './instrumentation/fetch'
import { setupRouteInstrumentation } from './instrumentation/route'
import { setupErrorInstrumentation } from './instrumentation/error'
import { injectTestBridge } from './test-bridge'
import { traceStore } from './tracing/traceStore'
import { mergeSsrTraceRecord } from './tracing/mergeSsrTraceRecord'
import { getSnapshotRevision } from './snapshot-revision'
import type { TObservatoryCommand, IObservatorySnapshot } from '../types/rpc'

interface IObservatoryWindow extends Window {
    __observatory__?: Record<string, unknown>
}

type TObservatoryPublicConfig = {
    heatmapThresholdCount: number
    heatmapThresholdTime: number
    fetchPageSize?: number
    debugRpc?: boolean
    composableNavigationMode?: 'route' | 'session'
    fetchDashboard?: boolean
    provideInjectGraph?: boolean
    composableTracker?: boolean
    piniaTracker?: boolean
    payloadInspector?: boolean
    stateCookieTracker?: boolean
    maxStateCookieEntries?: number
    renderHeatmap?: boolean
    transitionTracker?: boolean
    keepAliveTracker?: boolean
    maxKeepAliveEntries?: number
    traceViewer?: boolean
    heatmapHideInternals?: boolean
    maxPiniaTimeline?: number
    maxTraces?: number
}

type TNuxtAppInstance = ReturnType<typeof useNuxtApp>

type TObservatoryPluginContext = {
    nuxtApp: TNuxtAppInstance
    config: TObservatoryPublicConfig
    registries: Record<string, unknown>
    debugLog: (...args: unknown[]) => void
    composableNavigationMode: 'route' | 'session'
    heartbeatId: number | null
    lastSnapshotRevision: number
}

const SNAPSHOT_KEY_ALIASES: Record<string, string> = {
    composable: 'composables',
    pinia: 'piniaStores',
    render: 'renders',
    transition: 'transitions',
    stateCookie: 'stateCookies',
}

let timelineRefreshTimer: ReturnType<typeof setTimeout> | null = null

function mergeSsrSpans() {
    if (!import.meta.client) {
        return
    }

    const el = document.getElementById('__observatory_ssr_spans__')

    if (!el) {
        return
    }

    try {
        mergeSsrTraceRecord(JSON.parse(el.textContent ?? ''))
    } catch {
        // Ignore malformed inject payloads.
    }
}

async function mergeNitroTimelineArchive() {
    if (!import.meta.client) {
        return
    }

    const fetcher = (globalThis as { $fetch?: (url: string) => Promise<unknown> }).$fetch

    if (typeof fetcher !== 'function') {
        return
    }

    try {
        const records = await fetcher('/__observatory/nitro-timeline')

        if (!Array.isArray(records)) {
            return
        }

        for (const record of records) {
            mergeSsrTraceRecord(record)
        }
    } catch {
        // Endpoint is dev-only and absent when instrumentServer is off.
    }
}

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

function scheduleNitroTimelineRefresh() {
    if (!import.meta.client) {
        return
    }

    if (timelineRefreshTimer !== null) {
        clearTimeout(timelineRefreshTimer)
    }

    timelineRefreshTimer = setTimeout(() => {
        timelineRefreshTimer = null
        void mergeNitroTimelineArchive()
    }, 250)
}

function createDebugLog(debugRpc: boolean) {
    return (...args: unknown[]) => {
        if (debugRpc) {
            // eslint-disable-next-line no-console
            console.info('[observatory][rpc][host]', ...args)
        }
    }
}

function isSsrHydrating(nuxtApp: TNuxtAppInstance) {
    return (nuxtApp.isHydrating ?? false) && (nuxtApp.payload as { serverRendered?: boolean })?.serverRendered === true
}

function callIfFunction(target: unknown, method: string, ...args: unknown[]) {
    const fn = (target as Record<string, unknown> | undefined)?.[method]

    if (typeof fn === 'function') {
        ;(fn as (...fnArgs: unknown[]) => void).apply(target, args)
    }
}

function createObservatoryContext(nuxtApp: TNuxtAppInstance, config: TObservatoryPublicConfig): TObservatoryPluginContext {
    const registries: Record<string, unknown> = {}

    if (typeof config.maxTraces === 'number') {
        traceStore.setMaxTraces(config.maxTraces)
    }

    if (config.renderHeatmap) {
        nuxtApp.vueApp.config.performance = true
        registries.render = setupRenderRegistry(nuxtApp, {
            isHydrating: () => isSsrHydrating(nuxtApp),
        })
    }

    if (config.fetchDashboard) {
        registries.fetch = setupFetchRegistry()
    }

    if (config.provideInjectGraph) {
        registries.provideInject = setupProvideInjectRegistry()
    }

    if (config.composableTracker) {
        registries.composable = setupComposableRegistry()
    }

    if (config.piniaTracker) {
        const piniaRegistry = setupPiniaStoreRegistry({
            pinia: (nuxtApp as { $pinia?: unknown }).$pinia,
            nuxtPayload: nuxtApp.payload,
            maxTimeline: config.maxPiniaTimeline,
        })

        registries.pinia = piniaRegistry

        const attachWhenPiniaReady = () => {
            piniaRegistry.attachPinia((nuxtApp as { $pinia?: unknown }).$pinia)
        }

        nuxtApp.hook('app:created', attachWhenPiniaReady)
        nuxtApp.hook('app:mounted', attachWhenPiniaReady)
    }

    if (config.payloadInspector) {
        registries.payload = setupPayloadRegistry({
            getPayload: () => nuxtApp.payload,
            isHydrating: () => isSsrHydrating(nuxtApp),
        })
    }

    if (config.stateCookieTracker) {
        registries.stateCookie = setupStateCookieRegistry({
            maxEntries: config.maxStateCookieEntries,
            isHydrating: () => isSsrHydrating(nuxtApp),
        })
    }

    if (config.transitionTracker) {
        registries.transition = setupTransitionRegistry()
    }

    if (config.keepAliveTracker) {
        registries.keepAlive = setupKeepAliveRegistry({
            maxEntries: config.maxKeepAliveEntries,
        })
    }

    return {
        nuxtApp,
        config,
        registries,
        debugLog: createDebugLog(config.debugRpc === true),
        composableNavigationMode: config.composableNavigationMode === 'session' ? 'session' : 'route',
        heartbeatId: null,
        lastSnapshotRevision: -1,
    }
}

function serializeTraces(traceViewerEnabled: boolean) {
    if (!traceViewerEnabled) {
        return []
    }

    return traceStore.getAllTraces().map((trace) => ({
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
}

function buildSnapshot(ctx: TObservatoryPluginContext): IObservatorySnapshot {
    const trackerDefs = [
        { key: 'fetch', fallback: [] },
        { key: 'provideInject', fallback: { provides: [], injects: [] } },
        { key: 'composable', fallback: [] },
        { key: 'pinia', fallback: [] },
        {
            key: 'payload',
            fallback: { capturedAt: 0, isHydrating: false, serverRendered: false, keyCount: 0, totalBytes: 0, keys: [] },
        },
        { key: 'stateCookie', fallback: [] },
        { key: 'keepAlive', fallback: { events: [], cache: [] } },
        { key: 'render', fallback: {} },
        { key: 'transition', fallback: {} },
    ] as const

    const snapshot: Record<string, unknown> = {}

    for (const { key, fallback } of trackerDefs) {
        const reg = ctx.registries[key] as unknown
        const hasGetSnapshot = Boolean(reg) && typeof (reg as { getSnapshot?: () => unknown }).getSnapshot === 'function'
        const snapshotKey = SNAPSHOT_KEY_ALIASES[key] ?? key

        snapshot[snapshotKey] = hasGetSnapshot ? safeParse((reg as { getSnapshot: () => unknown }).getSnapshot(), fallback) : fallback
    }

    snapshot.traces = serializeTraces(!!ctx.config.traceViewer)
    snapshot.features = {
        fetchDashboard: !!ctx.registries.fetch,
        provideInjectGraph: !!ctx.registries.provideInject,
        composableTracker: !!ctx.registries.composable,
        piniaTracker: !!ctx.registries.pinia,
        payloadInspector: !!ctx.registries.payload,
        stateCookieTracker: !!ctx.registries.stateCookie,
        composableNavigationMode: ctx.composableNavigationMode,
        fetchPageSize: typeof ctx.config.fetchPageSize === 'number' ? ctx.config.fetchPageSize : 20,
        heatmapThresholdCount: typeof ctx.config.heatmapThresholdCount === 'number' ? ctx.config.heatmapThresholdCount : 3,
        heatmapThresholdTime: typeof ctx.config.heatmapThresholdTime === 'number' ? ctx.config.heatmapThresholdTime : 16,
        renderHeatmap: !!ctx.registries.render,
        transitionTracker: !!ctx.registries.transition,
        keepAliveTracker: !!ctx.registries.keepAlive,
        traceViewer: !!ctx.config.traceViewer,
    }

    return snapshot as IObservatorySnapshot
}

function broadcastAll(ctx: TObservatoryPluginContext, reason = 'unknown') {
    if (!import.meta.client || !import.meta.hot) {
        return
    }

    const snapshot = buildSnapshot(ctx)

    ctx.debugLog('push snapshot', {
        reason,
        fetch: Array.isArray(snapshot.fetch) ? snapshot.fetch.length : 0,
        composables: Array.isArray(snapshot.composables) ? snapshot.composables.length : 0,
        piniaStores: Array.isArray(snapshot.piniaStores) ? snapshot.piniaStores.length : 0,
        renders: Array.isArray(snapshot.renders) ? snapshot.renders.length : 0,
        transitions: Array.isArray(snapshot.transitions) ? snapshot.transitions.length : 0,
        traces: Array.isArray(snapshot.traces) ? snapshot.traces.length : 0,
        stateCookies: Array.isArray(snapshot.stateCookies) ? snapshot.stateCookies.length : 0,
        keepAlive: Array.isArray((snapshot.keepAlive as { events?: unknown[] } | undefined)?.events)
            ? (snapshot.keepAlive as { events: unknown[] }).events.length
            : 0,
    })

    ctx.lastSnapshotRevision = getSnapshotRevision()
    import.meta.hot.send('observatory:snapshot', snapshot)
}

function handleObservatoryCommand(ctx: TObservatoryPluginContext, rawPayload: unknown) {
    if (!rawPayload || typeof rawPayload !== 'object') {
        return
    }

    const payload = rawPayload as TObservatoryCommand
    const composableRegistry = ctx.registries.composable as ReturnType<typeof setupComposableRegistry> | undefined
    const piniaRegistry = ctx.registries.pinia as ReturnType<typeof setupPiniaStoreRegistry> | undefined

    if (payload.cmd === 'request-snapshot') {
        ctx.debugLog('received command: request-snapshot')
        broadcastAll(ctx, 'command:request-snapshot')

        return
    }

    if (payload.cmd === 'clear-composables') {
        ctx.debugLog('received command: clear-composables')

        if (ctx.composableNavigationMode === 'session') {
            composableRegistry?.clearNonLayout()
        } else {
            composableRegistry?.clear()
        }

        broadcastAll(ctx, 'command:clear-composables')

        return
    }

    if (payload.cmd === 'set-mode') {
        ctx.debugLog('received command: set-mode', payload.mode)

        if (payload.mode === 'route' || payload.mode === 'session') {
            ctx.composableNavigationMode = payload.mode
        }

        broadcastAll(ctx, 'command:set-mode')

        return
    }

    if (payload.cmd === 'edit-composable') {
        ctx.debugLog('received command: edit-composable', { id: payload.id, key: payload.key })
        composableRegistry?.editValue(payload.id, payload.key, payload.value)

        return
    }

    if (payload.cmd === 'clear-pinia') {
        ctx.debugLog('received command: clear-pinia')
        piniaRegistry?.clear()
        broadcastAll(ctx, 'command:clear-pinia')

        return
    }

    if (payload.cmd === 'edit-pinia') {
        ctx.debugLog('received command: edit-pinia', { storeId: payload.storeId, path: payload.path })
        piniaRegistry?.editState(payload.storeId, payload.path, payload.value)
        broadcastAll(ctx, 'command:edit-pinia')
    }
}

function setupClientInstrumentation(ctx: TObservatoryPluginContext) {
    const fetchRegistry = ctx.registries.fetch as Parameters<typeof setupFetchInstrumentation>[1]

    if (ctx.config.traceViewer) {
        setupComponentInstrumentation(ctx.nuxtApp)
        setupFetchInstrumentation(ctx.nuxtApp, fetchRegistry, {
            onSuccessfulFetch: scheduleNitroTimelineRefresh,
        })
        mergeSsrSpans()
        void mergeNitroTimelineArchive()

        return
    }

    if (ctx.config.fetchDashboard) {
        setupFetchInstrumentation(ctx.nuxtApp, fetchRegistry)
    }
}

function resetTrackersOnNavigation(ctx: TObservatoryPluginContext) {
    callIfFunction(ctx.registries.render, 'reset')
    callIfFunction(ctx.registries.provideInject, 'clear')

    if (ctx.composableNavigationMode === 'route') {
        callIfFunction(ctx.registries.composable, 'clearNonLayout')
    }

    callIfFunction(ctx.registries.transition, 'clear')
}

function setupRouterHooks(ctx: TObservatoryPluginContext) {
    const router = useRouter()

    if (ctx.config.traceViewer) {
        setupRouteInstrumentation(ctx.nuxtApp, {
            getCurrentPath: () => router.currentRoute.value.path ?? '/',
        })
        setupErrorInstrumentation(ctx.nuxtApp)
    }

    router.beforeEach((_to, from) => {
        if (from?.name === undefined) {
            return
        }

        resetTrackersOnNavigation(ctx)
    })

    router.afterEach((to) => {
        const path = to.path ?? '/'
        callIfFunction(ctx.registries.composable, 'setRoute', path)
        callIfFunction(ctx.registries.render, 'setRoute', path)
        nextTick(() => broadcastAll(ctx, 'router:afterEach'))
    })
}

function startHeartbeat(ctx: TObservatoryPluginContext) {
    if (ctx.heartbeatId !== null) {
        return
    }

    ctx.heartbeatId = window.setInterval(() => {
        const revision = getSnapshotRevision()

        if (revision !== ctx.lastSnapshotRevision) {
            ctx.lastSnapshotRevision = revision
            ctx.debugLog('heartbeat detected snapshot change')
            import.meta.hot?.send('observatory:snapshot', buildSnapshot(ctx))
        }
    }, 400)
}

function registerLifecycleHooks(ctx: TObservatoryPluginContext) {
    ctx.nuxtApp.hook('app:mounted', () => {
        callIfFunction(ctx.registries.payload, 'capture')
        broadcastAll(ctx, 'app:mounted')
        nextTick(() => broadcastAll(ctx, 'app:mounted:nextTick'))
        setTimeout(() => broadcastAll(ctx, 'app:mounted:50ms'), 50)
        setTimeout(() => broadcastAll(ctx, 'app:mounted:250ms'), 250)

        if (import.meta.client) {
            startHeartbeat(ctx)
        }
    })

    ctx.nuxtApp.hook('page:finish', () => {
        callIfFunction(ctx.registries.payload, 'capture')

        if (ctx.config.traceViewer) {
            void mergeNitroTimelineArchive()
        }

        broadcastAll(ctx, 'page:finish')
    })
}

function setupClientHost(ctx: TObservatoryPluginContext) {
    if (!import.meta.client) {
        return
    }

    setupClientInstrumentation(ctx)

    delete (window as IObservatoryWindow).__observatory__
    ;(window as IObservatoryWindow).__observatory__ = ctx.registries
    injectTestBridge()

    const composableRegistry = ctx.registries.composable as ReturnType<typeof setupComposableRegistry> | undefined
    const piniaRegistry = ctx.registries.pinia as ReturnType<typeof setupPiniaStoreRegistry> | undefined
    const stateCookieRegistry = ctx.registries.stateCookie as ReturnType<typeof setupStateCookieRegistry> | undefined
    const keepAliveRegistry = ctx.registries.keepAlive as ReturnType<typeof setupKeepAliveRegistry> | undefined

    composableRegistry?.onComposableChange?.(() => {
        broadcastAll(ctx, 'composable:onChange')
    })
    piniaRegistry?.onChange?.(() => {
        broadcastAll(ctx, 'pinia:onChange')
    })
    stateCookieRegistry?.onChange?.(() => {
        broadcastAll(ctx, 'stateCookie:onChange')
    })
    keepAliveRegistry?.onChange?.(() => {
        broadcastAll(ctx, 'keepAlive:onChange')
    })

    import.meta.hot?.on('observatory:command', (rawPayload: unknown) => {
        handleObservatoryCommand(ctx, rawPayload)
    })

    ctx.nuxtApp.hook('app:beforeUnmount', () => {
        import.meta.hot?.off('observatory:command')
        callIfFunction(ctx.registries.pinia, 'teardown')

        if (ctx.heartbeatId !== null) {
            window.clearInterval(ctx.heartbeatId)
            ctx.heartbeatId = null
        }
    })

    setupRouterHooks(ctx)
}

export default defineNuxtPlugin(() => {
    if (!import.meta.dev) {
        return
    }

    const ctx = createObservatoryContext(useNuxtApp(), useRuntimeConfig().public.observatory as TObservatoryPublicConfig)

    registerLifecycleHooks(ctx)
    setupClientHost(ctx)
})
