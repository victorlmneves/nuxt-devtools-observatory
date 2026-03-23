import { defineNuxtModule, addPlugin, addServerPlugin, createResolver, addVitePlugin } from '@nuxt/kit'
import { fetchInstrumentPlugin } from './transforms/fetch-transform'
import { provideInjectPlugin } from './transforms/provide-inject-transform'
import { composableTrackerPlugin } from './transforms/composable-transform'
import { transitionTrackerPlugin } from './transforms/transition-transform'

export interface ModuleOptions {
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
     * @default 5
     */
    heatmapThreshold?: number
}

export default defineNuxtModule<ModuleOptions>({
    meta: {
        name: 'nuxt-devtools-observatory',
        configKey: 'observatory',
        compatibility: { nuxt: '^3.0.0 || ^4.0.0' },
    },

    defaults: {
        fetchDashboard: true,
        provideInjectGraph: true,
        composableTracker: true,
        renderHeatmap: true,
        transitionTracker: true,
        heatmapThreshold: 5,
    },

    setup(options, nuxt) {
        // Only active in dev mode
        if (!nuxt.options.dev) {
            return
        }

        // Ensure launch-editor can open files when the user clicks "open in editor".
        // VS Code is the safe default — it won't override an editor the user already
        // configured via LAUNCH_EDITOR or VITE_EDITOR env vars.
        if (!process.env.LAUNCH_EDITOR && !process.env.VITE_EDITOR) {
            process.env.LAUNCH_EDITOR = 'code'
        }

        const resolver = createResolver(import.meta.url)

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
        if (options.fetchDashboard) {
            addVitePlugin(fetchInstrumentPlugin())
        }

        if (options.provideInjectGraph) {
            addVitePlugin(provideInjectPlugin())
        }

        if (options.composableTracker) {
            addVitePlugin(composableTrackerPlugin())
        }

        if (options.transitionTracker) {
            addVitePlugin(transitionTrackerPlugin())
        }

        // ── Runtime plugins ───────────────────────────────────────────────────
        addPlugin(resolver.resolve('./runtime/plugin'))

        // ── Nitro plugin for SSR fetch capture ────────────────────────────────
        if (options.fetchDashboard) {
            addServerPlugin(resolver.resolve('./runtime/nitro/fetch-capture'))
        }

        // ── Serve the client SPA on its own Vite dev server ──────────────────
        const CLIENT_PORT = 4949
        const clientOrigin = `http://localhost:${CLIENT_PORT}`

        nuxt.hook('vite:serverCreated', async (_viteServer, env) => {
            if (!env.isClient) {
                return
            }

            const { createServer } = await import('vite')
            const { default: vue } = await import('@vitejs/plugin-vue')

            const inner = await createServer({
                root: resolver.resolve('../client'),
                base: '/',
                server: { port: CLIENT_PORT, strictPort: true, cors: true },
                appType: 'spa',
                configFile: false,
                plugins: [vue()],
                logLevel: 'warn',
            })

            await inner.listen()
            nuxt.hook('close', () => inner.close())
        })

        // ── Devtools integration ──────────────────────────────────────────────
        // SPA runs at localhost:4949, cross-origin from :3000.
        // Data is bridged via postMessage (see plugin.ts + stores/observatory.ts).
        const base = clientOrigin

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nuxt.hook('devtools:customTabs', (tabs: any[]) => {
            if (options.fetchDashboard) {
                tabs.push({
                    name: 'observatory-fetch',
                    title: 'useFetch',
                    icon: 'carbon:radio-button',
                    view: { type: 'iframe', src: `${base}/fetch` },
                })
            }

            if (options.provideInjectGraph) {
                tabs.push({
                    name: 'observatory-provide',
                    title: 'provide/inject',
                    icon: 'carbon:branch',
                    view: { type: 'iframe', src: `${base}/provide` },
                })
            }

            if (options.composableTracker) {
                tabs.push({
                    name: 'observatory-composables',
                    title: 'Composables',
                    icon: 'carbon:function',
                    view: { type: 'iframe', src: `${base}/composables` },
                })
            }

            if (options.renderHeatmap) {
                tabs.push({
                    name: 'observatory-heatmap',
                    title: 'Heatmap',
                    icon: 'carbon:heat-map',
                    view: { type: 'iframe', src: `${base}/heatmap` },
                })
            }

            if (options.transitionTracker) {
                tabs.push({
                    name: 'observatory-transitions',
                    title: 'Transitions',
                    icon: 'carbon:movement',
                    view: { type: 'iframe', src: `${base}/transitions` },
                })
            }
        })

        // ── Expose module options to runtime ──────────────────────────────────
        nuxt.options.runtimeConfig.public.observatory = {
            heatmapThreshold: options.heatmapThreshold ?? 5,
            clientOrigin,
        }
    },
})
