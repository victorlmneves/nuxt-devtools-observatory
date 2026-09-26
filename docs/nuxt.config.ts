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
                '/feature-guides/pinia-tracker',
                '/feature-guides/payload-inspector',
                '/feature-guides/render-heatmap',
                '/feature-guides/transition-tracker',
                '/feature-guides/trace-viewer',
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

    typescript: {
        tsConfig: {
            compilerOptions: {
                module: 'ESNext',
            },
        },
    },

    icon: {
        provider: 'iconify',
    },
})
