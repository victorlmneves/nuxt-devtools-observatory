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

    // Tracker tabs inherit module defaults (on in dev). Optional OBSERVATORY_* env
    // vars still override those defaults. Heatmap time stays 16ms here so playground
    // demos light up without waiting for a 1600ms render.
    observatory: {
        heatmapThresholdCount: process.env.OBSERVATORY_HEATMAP_THRESHOLD_COUNT
            ? Number(process.env.OBSERVATORY_HEATMAP_THRESHOLD_COUNT)
            : 3,
        heatmapThresholdTime: process.env.OBSERVATORY_HEATMAP_THRESHOLD_TIME ? Number(process.env.OBSERVATORY_HEATMAP_THRESHOLD_TIME) : 16,
        fetchPageSize: process.env.OBSERVATORY_FETCH_PAGE_SIZE ? Number(process.env.OBSERVATORY_FETCH_PAGE_SIZE) : 20,
    },

    devtools: { enabled: true },
})
