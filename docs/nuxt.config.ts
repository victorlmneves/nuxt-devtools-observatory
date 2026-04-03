import { version } from '../package.json'

export default defineNuxtConfig({
    compatibilityDate: '2025-10-01',

    runtimeConfig: {
        public: {
            version,
        },
    },

    modules: ['@nuxt/ui', '@nuxt/content'],

    devtools: {
        enabled: true,
    },

    routeRules: {
        '/guide': { redirect: '/getting-started' },
        '/**': { prerender: true },
    },

    css: ['~/assets/main.css'],

    content: {
        build: {
            markdown: {
                toc: {
                    searchDepth: 1,
                },
            },
        },
    },

    experimental: {
        asyncContext: true,
    },

    icon: {
        provider: 'iconify',
    },

    site: {
        url: 'https://nuxt-devtools-observatory.vercel.app',
    },
})
