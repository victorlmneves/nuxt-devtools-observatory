<script setup lang="ts">
const appConfig = useAppConfig()

const { data: navigation } = await useAsyncData('navigation', () => queryCollectionNavigation('docs'))
const { data: files } = useLazyAsyncData('search', () => queryCollectionSearchSections('docs'), {
    server: false,
})

useHead({
    htmlAttrs: {
        lang: 'en',
    },
    link: [
        {
            rel: 'icon',
            href: '/nuxt-devtools-observatory.png',
            type: 'image/png',
        },
    ],
})

useSeoMeta({
    titleTemplate: `%s - ${appConfig.observatoryDocs.title}`,
    description: appConfig.observatoryDocs.description,
    ogSiteName: appConfig.observatoryDocs.title,
    ogDescription: appConfig.observatoryDocs.description,
    ogImage: 'https://nuxt-devtools-observatory.vercel.app/nuxt-devtools-observatory.png',
    ogUrl: 'https://nuxt-devtools-observatory.vercel.app',
    twitterCard: 'summary_large_image',
    twitterImage: 'https://nuxt-devtools-observatory.vercel.app/nuxt-devtools-observatory.png',
    twitterSite: '@vitorneves',
})

provide('navigation', navigation)
</script>

<template>
    <UApp>
        <NuxtLoadingIndicator />

        <AppHeader />

        <UMain>
            <NuxtLayout>
                <NuxtPage />
            </NuxtLayout>
        </UMain>

        <AppFooter />

        <ClientOnly>
            <LazyUContentSearch :files="files" :navigation="navigation" />
        </ClientOnly>
    </UApp>
</template>
