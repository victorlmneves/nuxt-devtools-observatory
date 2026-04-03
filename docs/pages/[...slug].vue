<script setup lang="ts">
definePageMeta({
    layout: 'docs',
})

const route = useRoute()
const appConfig = useAppConfig()

const { data: page } = await useAsyncData(`docs-${route.path}`, () => queryCollection('docs').path(route.path).first())

if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })

const { data: surround } = await useAsyncData(`docs-${route.path}-surround`, () => {
    return queryCollectionItemSurroundings('docs', route.path, {
        fields: ['title', 'description', 'path'],
    })
})

const githubEditUrl = computed(() => {
    const stem = page.value?.stem
    const github = appConfig.observatoryDocs.github
    if (!stem) return '#'
    return `https://github.com/${github.owner}/${github.repo}/edit/${github.branch}/${github.contentDir}/${stem}.md`
})

useSeoMeta({
    title: page.value.title,
    titleTemplate: `%s - ${appConfig.observatoryDocs.title}`,
    description: page.value.description,
    ogTitle: `${page.value.title} - ${appConfig.observatoryDocs.title}`,
    ogDescription: page.value.description,
})
</script>

<template>
    <article>
        <ContentRenderer v-if="page" :value="page" />

        <footer class="docs-page-footer">
            <UButton :to="githubEditUrl" target="_blank" color="neutral" variant="soft" size="sm">Edit this page</UButton>
            <UButton
                to="https://github.com/victorneves/nuxt-devtools-observatory"
                target="_blank"
                color="neutral"
                variant="ghost"
                size="sm"
            >
                GitHub
            </UButton>
        </footer>

        <nav class="docs-surround" v-if="surround">
            <UButton v-if="surround[0]" :to="surround[0].path" color="neutral" variant="outline" size="sm">
                ← {{ surround[0].title }}
            </UButton>
            <UButton v-if="surround[1]" :to="surround[1].path" color="neutral" variant="outline" size="sm">
                {{ surround[1].title }} →
            </UButton>
        </nav>
    </article>
</template>
