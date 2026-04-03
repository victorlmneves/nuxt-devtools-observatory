<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'
import type { Ref } from 'vue'
import { inject } from 'vue'

const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')
</script>

<template>
    <UContainer>
        <UPage>
            <template #left>
                <UPageAside class="docs-page-aside">
                    <UContentNavigation v-if="navigation" :navigation="navigation" highlight />
                </UPageAside>
            </template>

            <slot />
        </UPage>
    </UContainer>
</template>
