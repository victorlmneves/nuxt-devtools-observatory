import { defineNuxtModule, addPlugin, addServerPlugin, createResolver, addVitePlugin, addImports } from '@nuxt/kit'
import { onDevToolsInitialized, extendServerRpc } from '@nuxt/devtools-kit'
import sirv from 'sirv'
import { composableTrackerPlugin } from './transforms/composable-transform'
import { fetchInstrumentPlugin } from './transforms/fetch-transform'
import { provideInjectPlugin } from './transforms/provide-inject-transform'
import { transitionTrackerPlugin } from './transforms/transition-transform'
import type { ObservatoryCommand, ObservatorySnapshot, ObservatoryClientFunctions, ObservatoryServerFunctions } from './types/rpc'
import { createModuleDefaults, resolveInstrumentServer } from './env-options'

export interface ModuleOptions {
    /**
     * Instrument composables, provide/inject, fetch, and transitions on the
     * server build as well as the client build. Enable this when using SSR so
     * server-side composable calls are captured. Disable for SPA projects to
     * avoid double-registration caused by the transform running on both builds.
     * @default true when SSR is enabled, false for SPA
     */
    instrumentServer?: boolean

    /**
     * Maximum number of fetch entries to keep in memory
     * @default 200
     */
    maxFetchEntries?: number

    /**
     * Maximum payload size (bytes) to store per fetch entry
     * @default 10000
     */
    maxPayloadBytes?: number

    /**
     * Number of fetch rows to load per infinite-scroll step in the Fetch Dashboard.
     * @default 20
     */
    fetchPageSize?: number

    /**
     * Maximum number of transition entries to keep in memory
     * @default 500
     */
    maxTransitions?: number

    /**
     * Maximum number of composable history events per entry
     * @default 50
     */
    maxComposableHistory?: number

    /**
     * Maximum number of composable entries to keep in memory
     * @default 300
     */
    maxComposableEntries?: number

    /**
     * Maximum number of Pinia timeline events to keep per store
     * @default 100
     */
    maxPiniaTimeline?: number

    /**
     * Maximum number of render timeline events per entry
     * @default 100
     */
    maxRenderTimeline?: number

    /**
     * Maximum number of route traces to keep in memory
     * @default 50
     */
    maxTraces?: number

    /**
     * Composable tracker navigation mode.
     * - `route`: clear composable entries on every page navigation
     * - `session`: keep entries across navigations until manually cleared
     * @default 'route'
     */
    composableNavigationMode?: 'route' | 'session'

    /**
     * Enable the useFetch / useAsyncData dashboard tab
     * @default true
     */
    fetchDashboard?: boolean

    /**
     * Enable the provide/inject graph tab
     * @default true
     */
    provideInjectGraph?: boolean

    /**
     * Enable the composable tracker tab
     * @default true
     */
    composableTracker?: boolean

    /**
     * Enable the Pinia state tracker tab
     * @default false
     */
    piniaTracker?: boolean

    /**
     * Enable the render heatmap tab
     * @default true
     */
    renderHeatmap?: boolean

    /**
     * Enable the transition tracker tab
     * @default true
     */
    transitionTracker?: boolean

    /**
     * Enable the trace viewer tab (per-route component + fetch + composable + render spans)
     * @default true
     */
    traceViewer?: boolean

    /**
     * Hide node_modules/internal components in the render heatmap
     * @default false
     */
    heatmapHideInternals?: boolean

    /**
     * Minimum render count / ms threshold to highlight in the heatmap
     * @default 3
     */
    heatmapThresholdCount?: number

    /**
     * Minimum average render time (ms) to highlight in the heatmap
     * @default 16
     */
    heatmapThresholdTime?: number

    /**
     * Enable RPC handshake debug logs in the Observatory iframe/host bridge.
     * @default false
     */
    debugRpc?: boolean
}

// Feature tabs default on. instrumentServer is resolved in setup from SSR/SPA.
const defaults = createModuleDefaults()

export default defineNuxtModule<ModuleOptions>({
    meta: {
        name: 'nuxt-devtools-observatory',
        configKey: 'observatory',
        compatibility: { nuxt: '^3.0.0 || ^4.0.0' },
    },

    defaults,

    setup(options, nuxt) {
        // Merge logic: Nuxt config (user) options always take precedence over env/defaults
        // This is handled by Nuxt automatically, but for runtimeConfig, ensure we use the resolved options
        // Only active in dev mode
        if (!nuxt.options.dev) {
            return
        }

        // Ensure launch-editor can open files when the user clicks "open in editor".
        if (!process.env.LAUNCH_EDITOR && !process.env.VITE_EDITOR) {
            process.env.LAUNCH_EDITOR = 'code'
        }

        const resolver = createResolver(import.meta.url)

        // Nuxt already merged user config over `defaults` (env + product fallbacks).
        // Only instrumentServer is resolved here so SPA vs SSR can still decide.
        const resolved = {
            ...options,
            instrumentServer: resolveInstrumentServer(options.instrumentServer, nuxt.options.ssr !== false),
        }

        // ── Vite aliases for runtime shims (dev resolution) ──────────────────
        nuxt.hook('vite:extendConfig', (config) => {
            const alias = config.resolve?.alias
            const aliases = (Array.isArray(alias) ? {} : (alias ?? {})) as Record<string, string>
            aliases['nuxt-devtools-observatory/runtime/composable-registry'] = resolver.resolve('./runtime/composables/composable-registry')
            aliases['nuxt-devtools-observatory/runtime/provide-inject-registry'] = resolver.resolve(
                './runtime/composables/provide-inject-registry'
            )
            aliases['nuxt-devtools-observatory/runtime/fetch-registry'] = resolver.resolve('./runtime/composables/fetch-registry')
            aliases['nuxt-devtools-observatory/runtime/async-data-instrumentation'] = resolver.resolve(
                './runtime/instrumentation/asyncData'
            )
            ;(config as { resolve?: object }).resolve = { ...config.resolve, alias: aliases }
        })

        // ── Vite transforms ───────────────────────────────────────────────────
        const vitePluginScope = resolved.instrumentServer ? { server: true, client: true } : { server: false, client: true }

        if (resolved.fetchDashboard) {
            addVitePlugin(fetchInstrumentPlugin(), vitePluginScope)
            // Auto-import the shims injected by the transform so they resolve
            // without needing an explicit import statement in the transformed file.
            addImports([
                { name: '__devFetchCall', from: resolver.resolve('./runtime/composables/fetch-registry') },
                { name: 'useTracedAsyncData', from: resolver.resolve('./runtime/instrumentation/asyncData') },
            ])
        }

        if (resolved.provideInjectGraph) {
            addVitePlugin(provideInjectPlugin(), vitePluginScope)
        }

        if (resolved.composableTracker) {
            addVitePlugin(composableTrackerPlugin(), vitePluginScope)
        }

        if (resolved.transitionTracker) {
            addVitePlugin(transitionTrackerPlugin(), vitePluginScope)
        }

        const trackersEnabled = Boolean(
            resolved.fetchDashboard ||
                resolved.provideInjectGraph ||
                resolved.composableTracker ||
                resolved.piniaTracker ||
                resolved.renderHeatmap ||
                resolved.transitionTracker ||
                resolved.traceViewer
        )

        // ── Runtime plugins ───────────────────────────────────────────────────
        // Trace Viewer needs the client plugin for route/component/fetch spans
        // even when every other tab is disabled.
        if (trackersEnabled) {
            addPlugin(resolver.resolve('./runtime/plugin'))
        }

        // ── Nitro plugin for SSR fetch capture / trace injection ──────────────
        if (resolved.fetchDashboard || (resolved.traceViewer && resolved.instrumentServer)) {
            addServerPlugin(resolver.resolve('./runtime/nitro/fetch-capture'))
        }

        // ── Devtools integration ──────────────────────────────────────────────
        const base = '/__observatory'
        const debugRpc = resolved.debugRpc === true
        const debugLog = (...args: unknown[]) => {
            if (debugRpc) {
                // eslint-disable-next-line no-console
                console.info('[observatory][rpc][server]', ...args)
            }
        }

        // Last host-app snapshot received from runtime/plugin.ts through Vite HMR.
        let latestSnapshot: ObservatorySnapshot = {
            fetch: [],
            provideInject: { provides: [], injects: [] },
            composables: [],
            piniaStores: [],
            renders: [],
            transitions: [],
            traces: [],
            features: {
                fetchDashboard: !!resolved.fetchDashboard,
                provideInjectGraph: !!resolved.provideInjectGraph,
                composableTracker: !!resolved.composableTracker,
                piniaTracker: !!resolved.piniaTracker,
                composableNavigationMode: resolved.composableNavigationMode,
                fetchPageSize: resolved.fetchPageSize,
                heatmapThresholdCount: resolved.heatmapThresholdCount,
                heatmapThresholdTime: resolved.heatmapThresholdTime,
                renderHeatmap: !!resolved.renderHeatmap,
                transitionTracker: !!resolved.transitionTracker,
                traceViewer: !!resolved.traceViewer,
            },
        }

        let rpc: ReturnType<typeof extendServerRpc<ObservatoryClientFunctions, ObservatoryServerFunctions>> | null = null
        let viteServer: { ws: { send: (event: string, data: unknown) => void } } | null = null

        const emitCommand = (command: ObservatoryCommand) => {
            if (!viteServer) {
                console.warn('[observatory][rpc][server] command dropped (vite ws not ready)', command)

                return
            }

            debugLog('send command', command)
            viteServer.ws.send('observatory:command', command)
        }

        // Register a Vite middleware on the Nuxt dev server so the Observatory
        // SPA is served same-origin from /__observatory.
        // This must be added during module setup (not deferred), otherwise
        // configureServer can miss Vite initialization.
        addVitePlugin({
            name: 'nuxt-devtools-observatory:sirv-client',
            configureServer(server) {
                viteServer = server
                const clientDist = resolver.resolve('../client/dist')
                server.middlewares.use(base, sirv(clientDist, { dev: true, single: true }))

                server.ws.on('observatory:snapshot', (snapshot: ObservatorySnapshot) => {
                    latestSnapshot = snapshot
                    debugLog('received host snapshot', {
                        fetch: Array.isArray(snapshot.fetch) ? snapshot.fetch.length : 0,
                        composables: Array.isArray(snapshot.composables) ? snapshot.composables.length : 0,
                        piniaStores: Array.isArray(snapshot.piniaStores) ? snapshot.piniaStores.length : 0,
                        renders: Array.isArray(snapshot.renders) ? snapshot.renders.length : 0,
                        transitions: Array.isArray(snapshot.transitions) ? snapshot.transitions.length : 0,
                    })

                    rpc?.broadcast.onSnapshot.asEvent(snapshot)
                })
            },
        })

        onDevToolsInitialized(() => {
            rpc = extendServerRpc<ObservatoryClientFunctions, ObservatoryServerFunctions>(
                'observatory',
                {
                    async getSnapshot() {
                        return latestSnapshot
                    },
                    async requestSnapshot() {
                        emitCommand({ cmd: 'request-snapshot' })
                    },
                    async clearComposables() {
                        emitCommand({ cmd: 'clear-composables' })
                    },
                    async setComposableMode(mode) {
                        emitCommand({ cmd: 'set-mode', mode })
                    },
                    async editComposableValue(id, key, value) {
                        emitCommand({ cmd: 'edit-composable', id, key, value })
                    },
                    async clearPiniaStores() {
                        emitCommand({ cmd: 'clear-pinia' })
                    },
                    async editPiniaState(storeId, path, value) {
                        emitCommand({ cmd: 'edit-pinia', storeId, path, value })
                    },
                },
                nuxt
            )

            // Push current known snapshot once RPC is ready so newly opened tabs
            // do not wait for the next host-side event.
            rpc.broadcast.onSnapshot.asEvent(latestSnapshot)
        }, nuxt)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nuxt.hook('devtools:customTabs' as any, (tabs: any[]) => {
            if (trackersEnabled) {
                tabs.push({
                    name: 'observatory-trackers',
                    title: 'Observatory Trackers',
                    icon: 'carbon:heat-map',
                    view: { type: 'iframe', src: `${base}/trackers${resolved.debugRpc ? '?debugRpc=1' : ''}` },
                })
            }
        })

        // ── Expose module options to runtime ──────────────────────────────────
        nuxt.options.runtimeConfig.public.observatory = {
            instrumentServer: resolved.instrumentServer,
            fetchDashboard: resolved.fetchDashboard,
            provideInjectGraph: resolved.provideInjectGraph,
            composableTracker: resolved.composableTracker,
            piniaTracker: resolved.piniaTracker,
            renderHeatmap: resolved.renderHeatmap,
            transitionTracker: resolved.transitionTracker,
            traceViewer: resolved.traceViewer,
            maxFetchEntries: resolved.maxFetchEntries,
            maxPayloadBytes: resolved.maxPayloadBytes,
            fetchPageSize: resolved.fetchPageSize,
            maxTransitions: resolved.maxTransitions,
            maxComposableHistory: resolved.maxComposableHistory,
            maxComposableEntries: resolved.maxComposableEntries,
            maxPiniaTimeline: resolved.maxPiniaTimeline,
            maxRenderTimeline: resolved.maxRenderTimeline,
            maxTraces: resolved.maxTraces,
            composableNavigationMode: resolved.composableNavigationMode,
            heatmapHideInternals: resolved.heatmapHideInternals,
            heatmapThresholdCount: resolved.heatmapThresholdCount,
            heatmapThresholdTime: resolved.heatmapThresholdTime,
            debugRpc: resolved.debugRpc,
        }
    },
})
