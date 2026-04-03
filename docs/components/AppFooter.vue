<script setup lang="ts">
const { footer } = useAppConfig()
</script>

<!-- <template>
    <footer class="docs-footer">
        <UContainer class="docs-footer__inner">
            <p>Nuxt DevTools Observatory is an in-repo documentation site for the module, playground, and runtime reference.</p>

            <div class="docs-footer__links">
                <ULink to="/getting-started/installation">Get Started</ULink>
                <ULink to="/feature-guides">Feature Guides</ULink>
                <ULink to="https://github.com/victorneves/nuxt-devtools-observatory" target="_blank">GitHub</ULink>
            </div>
        </UContainer>
    </footer>
</template> -->

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
