export default defineNuxtConfig({
    modules: ['../src/module'],

    observatory: {
        fetchDashboard: true,
        provideInjectGraph: true,
        composableTracker: true,
        renderHeatmap: true,
        transitionTracker: true,
        heatmapThreshold: 5,
    },

    devtools: { enabled: true },
})
