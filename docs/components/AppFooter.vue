<script setup lang="ts">
const { footer } = useAppConfig()
</script>

<template>
    <UFooter>
        <template #left>
            {{ footer.credits }}
        </template>

        <!-- {{ footer.links }} -->
        <template #right>
            <UColorModeButton v-if="footer?.colorMode" />
            <template v-if="footer?.links">
                <template v-for="(link, index) of footer?.links" :key="index">
                    <ULink v-if="link.to && link.to.startsWith('/')" v-bind="link" class="mx-2">
                        {{ link.label || link.to }}
                    </ULink>
                    <a v-else-if="link.to" :href="link.to" v-bind="link" class="mx-2">
                        {{ link.label }}
                    </a>
                </template>
            </template>
        </template>
    </UFooter>
</template>
