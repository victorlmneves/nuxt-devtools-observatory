export default defineNuxtConfig({
    compatibilityDate: '2025-10-01',

    extends: ['@nuxt-themes/docus'],

    modules: ['@nuxt/content'],

    devtools: {
        enabled: true,
    },

    css: ['~/assets/site.css'],

    content: {
        build: {
            markdown: {
                toc: {
                    depth: 3,
                    searchDepth: 3,
                },
            },
        },
    },
})
