import { defineNuxtPlugin, useRuntimeConfig } from '#app'
import { setupFetchRegistry } from './composables/fetch-registry'
import { setupProvideInjectRegistry } from './composables/provide-inject-registry'
import { setupComposableRegistry } from './composables/composable-registry'
import { setupRenderRegistry } from './composables/render-registry'

export default defineNuxtPlugin((nuxtApp) => {
    if (!import.meta.dev) return

    const config = useRuntimeConfig().public.observatory as { heatmapThreshold: number }

    // Each registry attaches to the Vue app and exposes data over the WS channel
    const fetchRegistry = setupFetchRegistry(nuxtApp)
    const provideInjectRegistry = setupProvideInjectRegistry(nuxtApp)
    const composableRegistry = setupComposableRegistry(nuxtApp)
    const renderRegistry = setupRenderRegistry(nuxtApp, config.heatmapThreshold)

    // Expose registries globally so Vite transform shims can reach them
    if (import.meta.client) {
        const w = window as any
        w.__observatory__ = {
            fetch: fetchRegistry,
            provideInject: provideInjectRegistry,
            composable: composableRegistry,
            render: renderRegistry,
        }
    }

    // Broadcast all registry data when devtools tab connects
    nuxtApp.hook('app:mounted', () => {
        broadcastAll()
    })

    function broadcastAll() {
        if (!import.meta.client) return
        const channel = getDevtoolsChannel()
        if (!channel) return
        channel.send('observatory:snapshot', {
            fetch: fetchRegistry.getAll(),
            provideInject: provideInjectRegistry.getAll(),
            composables: composableRegistry.getAll(),
            renders: renderRegistry.getAll(),
        })
    }

    function getDevtoolsChannel() {
        // Connects to @nuxt/devtools WS bridge if available
        return (window as any).__nuxt_devtools__?.channel ?? null
    }
})
