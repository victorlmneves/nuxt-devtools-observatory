export default defineAppConfig({
    observatoryDocs: {
        title: 'Nuxt DevTools Observatory',
        description: 'Setup, feature guides, API reference, and troubleshooting for Nuxt DevTools Observatory.',
        github: {
            owner: 'victorlmneves',
            repo: 'nuxt-devtools-observatory',
            branch: 'main',
            contentDir: 'docs/content',
        },
    },
    ui: {
        colors: {
            primary: 'green',
            neutral: 'slate',
        },
        footer: {
            slots: {
                root: 'border-t border-default',
                left: 'text-sm text-muted',
            },
        },
    },
    seo: {
        siteName: 'Nuxt Devtools Observatory Docs - Setup, feature guides, API reference, and troubleshooting for Nuxt DevTools Observatory.',
    },
    header: {
        title: '',
        to: '/',
        logo: {
            alt: '',
            light: '',
            dark: '',
        },
        search: true,
        colorMode: true,
        links: [
            {
                icon: 'i-simple-icons-github',
                to: 'https://github.com/victorlmneves/nuxt-devtools-observatory',
                target: '_blank',
                'aria-label': 'GitHub',
            },
        ],
    },
    footer: {
        credits: `Nuxt DevTools Observatory • © ${new Date().getFullYear()}`,
        colorMode: false,
        links: [
            {
                to: '/getting-started/installation',
                label: 'Get Started',
                'aria-label': 'Nuxt DevTools Observatory Get Started',
            },
            {
                to: '/feature-guides',
                label: 'Feature Guides',
                'aria-label': 'Nuxt DevTools Observatory Feature Guides',
            },
            {
                to: 'https://github.com/victorneves/nuxt-devtools-observatory',
                label: 'GitHub',
                target: '_blank',
                'aria-label': 'Nuxt DevTools Observatory on GitHub',
            },
        ],
    },
    toc: {
        title: 'Table of Contents',
        bottom: {
            title: 'Community',
            edit: 'https://github.com/victorlmneves/nuxt-devtools-observatory/docs/edit/main/content',
            links: [
                {
                    icon: 'i-lucide-star',
                    label: 'Star on GitHub',
                    to: 'https://github.com/victorneves/nuxt-devtools-observatory"',
                    target: '_blank',
                },
                {
                    icon: 'i-lucide-book-open',
                    label: 'Nuxt DevTools Observatory docs',
                    to: 'https://nuxt-devtools-observatory.vercel.app/getting-started/installation',
                    target: '_blank',
                },
            ],
        },
    },
})
