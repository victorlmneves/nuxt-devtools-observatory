import { defineNuxtModule, addPlugin, addServerPlugin, createResolver, addVitePlugin } from '@nuxt/kit'
import { onDevToolsInitialized, extendServerRpc } from '@nuxt/devtools-kit'
import sirv from 'sirv'
import { composableTrackerPlugin } from './transforms/composable-transform'
import { fetchInstrumentPlugin } from './transforms/fetch-transform'
import { provideInjectPlugin } from './transforms/provide-inject-transform'
import { transitionTrackerPlugin } from './transforms/transition-transform'
import type { ObservatoryCommand, ObservatorySnapshot, ObservatoryClientFunctions, ObservatoryServerFunctions } from './types/rpc'

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
     * Maximum number of render timeline events per entry
     * @default 100
     */
    maxRenderTimeline?: number

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
     * Minimum render count / ms threshold to highlight in the heatmap
     * @default 1600
     */
    heatmapThresholdTime?: number

    /**
     * Enable RPC handshake debug logs in the Observatory iframe/host bridge.
     * @default false
     */
    debugRpc?: boolean
}

const defaults = {
    // Auto-enable server instrumentation for SSR projects unless explicitly overridden.
    // This ensures initial SSR snapshots include server-side composables/fetch events.
    instrumentServer: process.env.OBSERVATORY_INSTRUMENT_SERVER === 'true',
    fetchDashboard: process.env.OBSERVATORY_FETCH_DASHBOARD === 'true',
    provideInjectGraph: process.env.OBSERVATORY_PROVIDE_INJECT_GRAPH === 'true',
    composableTracker: process.env.OBSERVATORY_COMPOSABLE_TRACKER === 'true',
    renderHeatmap: process.env.OBSERVATORY_RENDER_HEATMAP === 'true',
    transitionTracker: process.env.OBSERVATORY_TRANSITION_TRACKER === 'true',
    heatmapThresholdCount: process.env.OBSERVATORY_HEATMAP_THRESHOLD_COUNT ? Number(process.env.OBSERVATORY_HEATMAP_THRESHOLD_COUNT) : 3,
    heatmapThresholdTime: process.env.OBSERVATORY_HEATMAP_THRESHOLD_TIME ? Number(process.env.OBSERVATORY_HEATMAP_THRESHOLD_TIME) : 1600,
    maxFetchEntries: process.env.OBSERVATORY_MAX_FETCH_ENTRIES ? Number(process.env.OBSERVATORY_MAX_FETCH_ENTRIES) : 200,
    maxPayloadBytes: process.env.OBSERVATORY_MAX_PAYLOAD_BYTES ? Number(process.env.OBSERVATORY_MAX_PAYLOAD_BYTES) : 10000,
    maxTransitions: process.env.OBSERVATORY_MAX_TRANSITIONS ? Number(process.env.OBSERVATORY_MAX_TRANSITIONS) : 500,
    maxComposableHistory: process.env.OBSERVATORY_MAX_COMPOSABLE_HISTORY ? Number(process.env.OBSERVATORY_MAX_COMPOSABLE_HISTORY) : 50,
    maxComposableEntries: process.env.OBSERVATORY_MAX_COMPOSABLE_ENTRIES ? Number(process.env.OBSERVATORY_MAX_COMPOSABLE_ENTRIES) : 300,
    maxRenderTimeline: process.env.OBSERVATORY_MAX_RENDER_TIMELINE ? Number(process.env.OBSERVATORY_MAX_RENDER_TIMELINE) : 100,
    composableNavigationMode:
        process.env.OBSERVATORY_COMPOSABLE_NAVIGATION_MODE === 'session' ? 'session' : ('route' as 'route' | 'session'),
    heatmapHideInternals: process.env.OBSERVATORY_HEATMAP_HIDE_INTERNALS === 'true',
    debugRpc: process.env.OBSERVATORY_DEBUG_RPC === 'true',
}

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

        // Explicitly resolve each option: user config > env > default
        const resolved = {
            ...defaults,
            ...options,
            // Allow runtime overrides via env
            heatmapHideInternals:
                typeof process.env.OBSERVATORY_HEATMAP_HIDE_INTERNALS !== 'undefined'
                    ? process.env.OBSERVATORY_HEATMAP_HIDE_INTERNALS === 'true'
                    : typeof options.heatmapHideInternals !== 'undefined'
                      ? options.heatmapHideInternals
                      : defaults.heatmapHideInternals,
            fetchDashboard:
                options.fetchDashboard ??
                (process.env.OBSERVATORY_FETCH_DASHBOARD ? process.env.OBSERVATORY_FETCH_DASHBOARD === 'true' : true),
            provideInjectGraph:
                options.provideInjectGraph ??
                (process.env.OBSERVATORY_PROVIDE_INJECT_GRAPH ? process.env.OBSERVATORY_PROVIDE_INJECT_GRAPH === 'true' : true),
            composableTracker:
                options.composableTracker ??
                (process.env.OBSERVATORY_COMPOSABLE_TRACKER ? process.env.OBSERVATORY_COMPOSABLE_TRACKER === 'true' : true),
            renderHeatmap:
                options.renderHeatmap ??
                (process.env.OBSERVATORY_RENDER_HEATMAP ? process.env.OBSERVATORY_RENDER_HEATMAP === 'true' : true),
            transitionTracker:
                options.transitionTracker ??
                (process.env.OBSERVATORY_TRANSITION_TRACKER ? process.env.OBSERVATORY_TRANSITION_TRACKER === 'true' : true),
            instrumentServer:
                options.instrumentServer ??
                (process.env.OBSERVATORY_INSTRUMENT_SERVER
                    ? process.env.OBSERVATORY_INSTRUMENT_SERVER === 'true'
                    : nuxt.options.ssr !== false),
            heatmapThresholdCount:
                options.heatmapThresholdCount ??
                (process.env.OBSERVATORY_HEATMAP_THRESHOLD_COUNT ? Number(process.env.OBSERVATORY_HEATMAP_THRESHOLD_COUNT) : 3),
            heatmapThresholdTime:
                options.heatmapThresholdTime ??
                (process.env.OBSERVATORY_HEATMAP_THRESHOLD_TIME ? Number(process.env.OBSERVATORY_HEATMAP_THRESHOLD_TIME) : 1600),
            maxFetchEntries:
                options.maxFetchEntries ??
                (process.env.OBSERVATORY_MAX_FETCH_ENTRIES ? Number(process.env.OBSERVATORY_MAX_FETCH_ENTRIES) : 200),
            maxPayloadBytes:
                options.maxPayloadBytes ??
                (process.env.OBSERVATORY_MAX_PAYLOAD_BYTES ? Number(process.env.OBSERVATORY_MAX_PAYLOAD_BYTES) : 10000),
            maxTransitions:
                options.maxTransitions ?? (process.env.OBSERVATORY_MAX_TRANSITIONS ? Number(process.env.OBSERVATORY_MAX_TRANSITIONS) : 500),
            maxComposableHistory:
                options.maxComposableHistory ??
                (process.env.OBSERVATORY_MAX_COMPOSABLE_HISTORY ? Number(process.env.OBSERVATORY_MAX_COMPOSABLE_HISTORY) : 50),
            maxComposableEntries:
                options.maxComposableEntries ??
                (process.env.OBSERVATORY_MAX_COMPOSABLE_ENTRIES ? Number(process.env.OBSERVATORY_MAX_COMPOSABLE_ENTRIES) : 300),
            maxRenderTimeline:
                options.maxRenderTimeline ??
                (process.env.OBSERVATORY_MAX_RENDER_TIMELINE ? Number(process.env.OBSERVATORY_MAX_RENDER_TIMELINE) : 100),
            composableNavigationMode:
                options.composableNavigationMode ??
                (process.env.OBSERVATORY_COMPOSABLE_NAVIGATION_MODE === 'session' ? 'session' : 'route'),
            debugRpc: options.debugRpc ?? (process.env.OBSERVATORY_DEBUG_RPC ? process.env.OBSERVATORY_DEBUG_RPC === 'true' : false),
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
            ;(config as { resolve?: object }).resolve = { ...config.resolve, alias: aliases }
        })

        // ── Vite transforms ───────────────────────────────────────────────────
        const vitePluginScope = resolved.instrumentServer ? { server: true, client: true } : { server: false, client: true }

        if (resolved.fetchDashboard) {
            addVitePlugin(fetchInstrumentPlugin(), vitePluginScope)
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

        // ── Runtime plugins ───────────────────────────────────────────────────
        if (
            resolved.fetchDashboard ||
            resolved.provideInjectGraph ||
            resolved.composableTracker ||
            resolved.renderHeatmap ||
            resolved.transitionTracker
        ) {
            addPlugin(resolver.resolve('./runtime/plugin'))
        }

        // ── Nitro plugin for SSR fetch capture ────────────────────────────────
        if (resolved.fetchDashboard) {
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
            renders: [],
            transitions: [],
            features: {
                fetchDashboard: !!resolved.fetchDashboard,
                provideInjectGraph: !!resolved.provideInjectGraph,
                composableTracker: !!resolved.composableTracker,
                composableNavigationMode: resolved.composableNavigationMode,
                renderHeatmap: !!resolved.renderHeatmap,
                transitionTracker: !!resolved.transitionTracker,
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
                },
                nuxt
            )

            // Push current known snapshot once RPC is ready so newly opened tabs
            // do not wait for the next host-side event.
            rpc.broadcast.onSnapshot.asEvent(latestSnapshot)
        }, nuxt)

        // Inject resolved config as a global variable for the client SPA
        // @ts-expect-error: 'render:response' is an internal Nuxt hook not typed in public API
        nuxt.hook('render:response', (response: { body: string }, { url }: { url: string }) => {
            if (url.startsWith('/trackers') || url === '/' || url.startsWith('/index.html')) {
                const configScript = `<script>window.__observatoryConfig = ${JSON.stringify(nuxt.options.runtimeConfig.public.observatory)};</script>`
                response.body = response.body.replace('<head>', `<head>\n${configScript}`)
            }
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nuxt.hook('devtools:customTabs' as any, (tabs: any[]) => {
            if (
                resolved.fetchDashboard ||
                resolved.provideInjectGraph ||
                resolved.composableTracker ||
                resolved.renderHeatmap ||
                resolved.transitionTracker
            ) {
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
            renderHeatmap: resolved.renderHeatmap,
            transitionTracker: resolved.transitionTracker,
            maxFetchEntries: resolved.maxFetchEntries,
            maxPayloadBytes: resolved.maxPayloadBytes,
            maxTransitions: resolved.maxTransitions,
            maxComposableHistory: resolved.maxComposableHistory,
            maxComposableEntries: resolved.maxComposableEntries,
            maxRenderTimeline: resolved.maxRenderTimeline,
            composableNavigationMode: resolved.composableNavigationMode,
            heatmapHideInternals: resolved.heatmapHideInternals,
            heatmapThresholdCount: resolved.heatmapThresholdCount,
            heatmapThresholdTime: resolved.heatmapThresholdTime,
            debugRpc: resolved.debugRpc,
        }
    },
})
