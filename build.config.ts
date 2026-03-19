import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
    failOnWarn: false,
    externals: [
        'fsevents',
        'vite',
        '@vitejs/plugin-vue',
        '@nuxt/kit',
        '@nuxt/schema',
        '#imports', // Nuxt auto-imports alias, must be external
    ],
    entries: ['src/nitro/fetch-capture'],
})
