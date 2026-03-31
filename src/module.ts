import { defineNuxtModule, addPlugin, addServerPlugin, createResolver, addVitePlugin } from '@nuxt/kit'
import { fetchInstrumentPlugin } from './transforms/fetch-transform'
import { provideInjectPlugin } from './transforms/provide-inject-transform'
import { composableTrackerPlugin } from './transforms/composable-transform'
import { transitionTrackerPlugin } from './transforms/transition-transform'

export interface ModuleOptions {
    /**
     * Maximum number of fetch entries to keep in memory
     * @default 200
     */
    maxFetchEntries?: number
    /**
     * Hide internal (node_modules) components in the render heatmap
     * @default false
     */
    heatmapHideInternals?: boolean

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
     * Minimum render count / ms threshold to highlight in the heatmap
     * @default 3
     */
    heatmapThresholdCount?: number

    /**
     * Minimum render count / ms threshold to highlight in the heatmap
     * @default 1600
     */
    heatmapThresholdTime?: number
}

export default defineNuxtModule<ModuleOptions>({
    meta: {
        name: 'nuxt-devtools-observatory',
        configKey: 'observatory',
        compatibility: { nuxt: '^3.0.0 || ^4.0.0' },
        heatmapHideInternals: process.env.OBSERVATORY_HEATMAP_HIDE_INTERNALS
            ? process.env.OBSERVATORY_HEATMAP_HIDE_INTERNALS === 'true'
            : false,
    },

    defaults: {
        fetchDashboard: true,
        provideInjectGraph: true,
        composableTracker: true,
        renderHeatmap: true,
        transitionTracker: true,
        heatmapThresholdCount: process.env.OBSERVATORY_HEATMAP_THRESHOLD_COUNT
            ? Number(process.env.OBSERVATORY_HEATMAP_THRESHOLD_COUNT)
            : 3,
        heatmapThresholdTime: process.env.OBSERVATORY_HEATMAP_THRESHOLD_TIME
            ? Number(process.env.OBSERVATORY_HEATMAP_THRESHOLD_TIME)
            : 1600,
        maxFetchEntries: process.env.OBSERVATORY_MAX_FETCH_ENTRIES ? Number(process.env.OBSERVATORY_MAX_FETCH_ENTRIES) : 200,
        maxPayloadBytes: process.env.OBSERVATORY_MAX_PAYLOAD_BYTES ? Number(process.env.OBSERVATORY_MAX_PAYLOAD_BYTES) : 10000,
        maxTransitions: process.env.OBSERVATORY_MAX_TRANSITIONS ? Number(process.env.OBSERVATORY_MAX_TRANSITIONS) : 500,
        maxComposableHistory: process.env.OBSERVATORY_MAX_COMPOSABLE_HISTORY ? Number(process.env.OBSERVATORY_MAX_COMPOSABLE_HISTORY) : 50,
        maxComposableEntries: process.env.OBSERVATORY_MAX_COMPOSABLE_ENTRIES ? Number(process.env.OBSERVATORY_MAX_COMPOSABLE_ENTRIES) : 300,
        maxRenderTimeline: process.env.OBSERVATORY_MAX_RENDER_TIMELINE ? Number(process.env.OBSERVATORY_MAX_RENDER_TIMELINE) : 100,
    },

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
            heatmapHideInternals:
                options.heatmapHideInternals ??
                (process.env.OBSERVATORY_HEATMAP_HIDE_INTERNALS ? process.env.OBSERVATORY_HEATMAP_HIDE_INTERNALS === 'true' : false),
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
        if (resolved.fetchDashboard) {
            addVitePlugin(fetchInstrumentPlugin())
        }

        if (resolved.provideInjectGraph) {
            addVitePlugin(provideInjectPlugin())
        }

        if (resolved.composableTracker) {
            addVitePlugin(composableTrackerPlugin())
        }

        if (resolved.transitionTracker) {
            addVitePlugin(transitionTrackerPlugin())
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

        // ── Serve the client SPA on its own Vite dev server ──────────────────
        const CLIENT_PORT = 4949
        const clientOrigin = `http://localhost:${CLIENT_PORT}`

        // Guard: vite:serverCreated can fire more than once in some configurations.
        // Attempting to bind strictPort: true twice throws EADDRINUSE, so we ensure
        // the inner server is only ever created once per module lifecycle.
        let innerServer: import('vite').ViteDevServer | null = null

        nuxt.hook('vite:serverCreated', async (_viteServer, env) => {
            if (!env.isClient) {
                return
            }

            if (innerServer) {
                return
            }

            const { createServer } = await import('vite')
            const { default: vue } = await import('@vitejs/plugin-vue')

            innerServer = await createServer({
                root: resolver.resolve('../client'),
                base: '/',
                server: { port: CLIENT_PORT, strictPort: true, cors: true },
                appType: 'spa',
                configFile: false,
                plugins: [vue()],
                logLevel: 'warn',
            })

            await innerServer.listen()
            nuxt.hook('close', () => {
                innerServer?.close()
                innerServer = null
            })
        })

        // ── Devtools integration ──────────────────────────────────────────────
        // SPA runs at localhost:4949, cross-origin from :3000.
        // Data is bridged via postMessage (see plugin.ts + stores/observatory.ts).
        const base = clientOrigin

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
                    view: { type: 'iframe', src: `${base}/trackers` },
                })
            }
        })

        // ── Expose module options to runtime ──────────────────────────────────
        nuxt.options.runtimeConfig.public.observatory = {
            heatmapHideInternals: resolved.heatmapHideInternals,
            heatmapThresholdCount: resolved.heatmapThresholdCount,
            heatmapThresholdTime: resolved.heatmapThresholdTime,
            clientOrigin,
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
        }
    },
})
