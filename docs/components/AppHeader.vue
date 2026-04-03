<script setup lang="ts">
const appConfig = useAppConfig()
const { version } = useRuntimeConfig().public

const links = [
    { label: 'Docs', to: '/getting-started/installation' },
    { label: 'Feature Guides', to: '/feature-guides' },
    { label: 'API', to: '/api-reference' },
    { label: 'Releases', to: 'https://github.com/victorlmneves/nuxt-devtools-observatory/releases', target: '_blank' },
]
</script>

<template>
    <UHeader>
        <template #title>
            <NuxtLink to="/" class="docs-brand">
                <img class="docs-logo mr-2" src="/logo-nuxt-devtools-observatory-header.png" :alt="appConfig.observatoryDocs.title" />
            </NuxtLink>
            <span class="docs-version">v{{ version }}</span>
        </template>

        <UNavigationMenu :items="links" />

        <template #right>
            <UColorModeButton />

            <UTooltip text="Open on GitHub" :kbds="['meta', 'G']">
                <UButton
                    color="neutral"
                    variant="ghost"
                    to="https://github.com/nuxt/ui"
                    target="_blank"
                    icon="i-simple-icons-github"
                    aria-label="GitHub"
                />
            </UTooltip>
        </template>
    </UHeader>
</template>
