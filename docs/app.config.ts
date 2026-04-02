export default defineAppConfig({
    docus: {
        title: 'Nuxt DevTools Observatory',
        description: 'Documentation for Nuxt DevTools Observatory: setup, feature guides, API reference, and troubleshooting.',
        image: '/social-card.png',
        socials: {
            github: 'victorlmneves/nuxt-devtools-observatory',
        },
        github: {
            owner: 'victorlmneves',
            repo: 'nuxt-devtools-observatory',
            branch: 'main',
            dir: 'docs/content',
            edit: true,
        },
        aside: {
            level: 1,
            collapsed: false,
            exclude: [],
        },
        header: {
            logo: true,
            showLinkIcon: true,
            exclude: [],
            fluid: true,
        },
    },
})
