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
    },

    nitro: {
        prerender: {
            crawlLinks: true,
            routes: [
                '/',
                '/getting-started',
                '/getting-started/installation',
                '/getting-started/configuration',
                '/feature-guides',
                '/feature-guides/usefetch-dashboard',
                '/feature-guides/provide-inject-graph',
                '/feature-guides/composable-tracker',
                '/feature-guides/render-heatmap',
                '/feature-guides/transition-tracker',
                '/api-reference',
                '/api-reference/module-options',
                '/api-reference/rpc-contracts',
                '/troubleshooting',
                '/troubleshooting/common-issues',
            ],
            failOnError: false,
        },
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
