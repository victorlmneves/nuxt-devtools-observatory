import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
    failOnWarn: false,
    externals: ['fsevents', 'vite', '@vitejs/plugin-vue', '@nuxt/kit', '@nuxt/schema'],
    entries: [
        'src/nitro/fetch-capture',
    ],
})
