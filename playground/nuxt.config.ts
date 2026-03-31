export default defineNuxtConfig({
    modules: ['../src/module'],

    imports: {
        autoImport: true,
    },

    observatory: {
        instrumentServer: false, // Instrument the server for SSR/Nitro fetch and composable tracking. Enable this when using SSR so server-side composable calls are captured. Disable for SPA projects to avoid double-registration caused by the transform running on both builds.
        fetchDashboard: true, // Enable useFetch dashboard
        provideInjectGraph: true, // Enable provide/inject graph
        composableTracker: true, // Enable composable tracker
        renderHeatmap: true, // Enable render heatmap
        transitionTracker: true, // Enable transition tracker
        heatmapThresholdCount: 3, // Highlight components with 3+ renders
        heatmapThresholdTime: 1600, // Highlight components with render time above this (ms)
        heatmapHideInternals: true, // Hide node_modules and internal components in the render heatmap
        maxFetchEntries: 200, // Max fetch entries to keep in memory
        maxPayloadBytes: 10000, // Max payload size (bytes) per fetch entry
        maxTransitions: 500, // Max transition entries to keep in memory
        maxComposableHistory: 50, // Max composable history events per entry
        maxComposableEntries: 300, // Max composable entries to keep in memory
        maxRenderTimeline: 100, // Max render timeline events per entry
    },

    devtools: { enabled: true },
})
