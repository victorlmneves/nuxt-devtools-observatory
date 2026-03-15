import { defineNuxtModule, addPlugin, createResolver, addVitePlugin } from '@nuxt/kit'
import { fetchInstrumentPlugin } from './transforms/fetch-transform'
import { provideInjectPlugin } from './transforms/provide-inject-transform'
import { composableTrackerPlugin } from './transforms/composable-transform'

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
     * Minimum render count / ms threshold to highlight in the heatmap
     * @default 5
     */
    heatmapThreshold?: number
}

export default defineNuxtModule<ModuleOptions>({
    meta: {
        name: 'nuxt-devtools-observatory',
        configKey: 'observatory',
        compatibility: { nuxt: '^3.0.0' },
    },

    defaults: {
        fetchDashboard: true,
        provideInjectGraph: true,
        composableTracker: true,
        renderHeatmap: true,
        heatmapThreshold: 5,
    },

    setup(options, nuxt) {
        // Only active in dev mode
        if (!nuxt.options.dev) return

        const resolver = createResolver(import.meta.url)

        // ── Vite aliases for runtime shims (dev resolution) ──────────────────
        nuxt.hook('vite:extendConfig', (config) => {
            config.resolve = config.resolve ?? {}
            config.resolve.alias = config.resolve.alias ?? {}
            const aliases = config.resolve.alias as Record<string, string>
            aliases['nuxt-devtools-observatory/runtime/composable-registry'] = resolver.resolve('./runtime/composables/composable-registry')
            aliases['nuxt-devtools-observatory/runtime/provide-inject-registry'] = resolver.resolve(
                './runtime/composables/provide-inject-registry'
            )
            aliases['nuxt-devtools-observatory/runtime/fetch-registry'] = resolver.resolve('./runtime/composables/fetch-registry')
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

        // ── Runtime plugins ───────────────────────────────────────────────────
        addPlugin(resolver.resolve('./runtime/plugin'))

        // ── Enable Vue performance API for heatmap ────────────────────────────
        if (options.renderHeatmap) {
            nuxt.hook('vue:setup', (app: any) => {
                app.config.performance = true
            })
        }

        // ── Nitro plugin for SSR fetch capture ────────────────────────────────
        if (options.fetchDashboard) {
            nuxt.hook('nitro:config', (nitroConfig) => {
                nitroConfig.plugins = nitroConfig.plugins || []
                nitroConfig.plugins.push(resolver.resolve('./nitro/fetch-capture'))
            })
        }

        // ── Devtools integration ──────────────────────────────────────────────
        nuxt.hook('devtools:customTabs', (tabs: any[]) => {
            if (options.fetchDashboard) {
                tabs.push({
                    name: 'observatory-fetch',
                    title: 'useFetch',
                    icon: 'carbon:radio-button',
                    view: { type: 'iframe', src: '/__observatory__/fetch' },
                })
            }
            if (options.provideInjectGraph) {
                tabs.push({
                    name: 'observatory-provide',
                    title: 'provide/inject',
                    icon: 'carbon:branch',
                    view: { type: 'iframe', src: '/__observatory__/provide' },
                })
            }
            if (options.composableTracker) {
                tabs.push({
                    name: 'observatory-composables',
                    title: 'Composables',
                    icon: 'carbon:function',
                    view: { type: 'iframe', src: '/__observatory__/composables' },
                })
            }
            if (options.renderHeatmap) {
                tabs.push({
                    name: 'observatory-heatmap',
                    title: 'Heatmap',
                    icon: 'carbon:heat-map',
                    view: { type: 'iframe', src: '/__observatory__/heatmap' },
                })
            }
        })

        // ── Expose module options to runtime ──────────────────────────────────
        nuxt.options.runtimeConfig.public.observatory = {
            heatmapThreshold: options.heatmapThreshold ?? 5,
        }
    },
})
