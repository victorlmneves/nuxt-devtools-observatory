import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
    alias: {
        '@observatory': fileURLToPath(new URL('../src', import.meta.url)),
        '@observatory-client': fileURLToPath(new URL('../client/src', import.meta.url)),
        '@observatory-tests': fileURLToPath(new URL('../tests', import.meta.url)),
    },

    modules: ['../src/module', '@pinia/nuxt'],

    imports: {
        autoImport: true,
    },

    observatory: {
        instrumentServer: import.meta.env.VITE_OBSERVATORY_INSTRUMENT_SERVER === 'true',
        fetchDashboard: import.meta.env.VITE_OBSERVATORY_FETCH_DASHBOARD === 'true',
        provideInjectGraph: import.meta.env.VITE_OBSERVATORY_PROVIDE_INJECT_GRAPH === 'true',
        composableTracker: import.meta.env.VITE_OBSERVATORY_COMPOSABLE_TRACKER === 'true',
        renderHeatmap: import.meta.env.VITE_OBSERVATORY_RENDER_HEATMAP === 'true',
        transitionTracker: import.meta.env.VITE_OBSERVATORY_TRANSITION_TRACKER === 'true',
        traceViewer: import.meta.env.VITE_OBSERVATORY_TRACE_VIEWER === 'true',
        heatmapThresholdCount: import.meta.env.VITE_OBSERVATORY_HEATMAP_THRESHOLD_COUNT
            ? Number(import.meta.env.VITE_OBSERVATORY_HEATMAP_THRESHOLD_COUNT)
            : 3,
        heatmapThresholdTime: import.meta.env.VITE_OBSERVATORY_HEATMAP_THRESHOLD_TIME
            ? Number(import.meta.env.VITE_OBSERVATORY_HEATMAP_THRESHOLD_TIME)
            : 16,
        heatmapHideInternals: import.meta.env.VITE_OBSERVATORY_HEATMAP_HIDE_INTERNALS === 'true',
    },

    devtools: { enabled: true },
})
