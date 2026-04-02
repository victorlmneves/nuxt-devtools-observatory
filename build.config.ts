import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
    failOnWarn: true,
    externals: [
        'fsevents',
        'vite',
        '@vitejs/plugin-vue',
        '@nuxt/kit',
        '@nuxt/schema',
        '@nuxt/devtools-kit',
        'sirv',
        'tinyexec',
        'totalist/sync',
        '@polka/url',
        'mrmime',
    ],
})
