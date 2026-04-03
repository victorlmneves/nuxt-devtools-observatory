<script setup lang="ts">
const appConfig = useAppConfig()
const { version } = useRuntimeConfig().public

const links = [
    { label: 'Docs', to: '/getting-started/installation' },
    { label: 'Feature Guides', to: '/feature-guides' },
    { label: 'API', to: '/api-reference' },
    { label: 'Releases', to: 'https://github.com/victorneves/nuxt-devtools-observatory/releases', target: '_blank' },
]
</script>

<!-- <template>
    <header class="docs-header">
        <UContainer class="docs-header__inner">
            <div class="docs-head-left">
                <NuxtLink to="/" class="docs-brand">{{ appConfig.observatoryDocs.title }}</NuxtLink>
                <span class="docs-version">v{{ version }}</span>
            </div>

            <nav class="docs-top-nav">
                <UButton
                    v-for="link in links"
                    :key="link.label"
                    :to="link.to"
                    :target="link.target"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                >
                    {{ link.label }}
                </UButton>
            </nav>

            <div class="docs-head-right">
                <UContentSearchButton :collapsed="false" variant="subtle" color="neutral" size="sm" class="docs-search-button" />
                <ULink to="https://github.com/victorneves/nuxt-devtools-observatory" target="_blank" class="docs-github-link">GitHub</ULink>
            </div>
        </UContainer>
    </header>
</template> -->

<template>
    <UHeader>
        <template #title>
            <NuxtLink to="/" class="docs-brand">
                <image class="docs-logo mr-2" src="/logo-nuxt-devtools-observatory-header.png" :alt="appConfig.observatoryDocs.title" />
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
