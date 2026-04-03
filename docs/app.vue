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
})

useSeoMeta({
    titleTemplate: `%s - ${appConfig.observatoryDocs.title}`,
    ogSiteName: appConfig.observatoryDocs.title,
    twitterCard: 'summary_large_image',
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
