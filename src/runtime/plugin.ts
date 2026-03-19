import { defineNuxtPlugin, useNuxtApp, useRuntimeConfig } from '#app'
import { setupFetchRegistry } from './composables/fetch-registry'
import { setupProvideInjectRegistry } from './composables/provide-inject-registry'
import { setupComposableRegistry } from './composables/composable-registry'
import { setupRenderRegistry } from './composables/render-registry'
import { setupTransitionRegistry } from './composables/transition-registry'

interface ObservatoryWindow extends Window {
    __observatory__?: Record<string, unknown>
    __nuxt_devtools__?: { channel?: { send: (event: string, data: unknown) => void } }
}

export default defineNuxtPlugin(() => {
    if (!import.meta.dev) {
        return
    }

    const nuxtApp = useNuxtApp()
    const config = useRuntimeConfig().public.observatory as { heatmapThreshold: number }

    // Enable Vue performance API for render heatmap
    nuxtApp.vueApp.config.performance = true

    // Each registry attaches to the Vue app and exposes data over the WS channel
    const fetchRegistry = setupFetchRegistry()
    const provideInjectRegistry = setupProvideInjectRegistry()
    const composableRegistry = setupComposableRegistry()
    const renderRegistry = setupRenderRegistry(nuxtApp, config.heatmapThreshold)
    const transitionRegistry = setupTransitionRegistry()

    // Expose registries globally so Vite transform shims can reach them
    if (import.meta.client) {
        // Always clear any previous registry to avoid cross-project state
        delete (window as ObservatoryWindow).__observatory__
        ;(window as ObservatoryWindow).__observatory__ = {
            fetch: fetchRegistry,
            provideInject: provideInjectRegistry,
            composable: composableRegistry,
            render: renderRegistry,
            transition: transitionRegistry,
        }

        // postMessage bridge — the Observatory SPA runs at localhost:4949 (cross-
        // origin). It cannot read window.top properties, but CAN send messages.
        // We register this listener immediately (not in app:mounted) so requests
        // arriving before hydration completes are handled correctly.
        window.addEventListener('message', (event: MessageEvent) => {
            if (event.data?.type !== 'observatory:request') {
                return
            }

            const source = event.source as Window | null

            try {
                const snapshot = {
                    fetch: fetchRegistry.getAll(),
                    provideInject: provideInjectRegistry.getAll(),
                    composables: composableRegistry.getAll(),
                    renders: renderRegistry.getAll(),
                    transitions: transitionRegistry.getAll(),
                }

                // Serialize snapshot to guarantee structured clone compliance
                const payload = JSON.stringify(snapshot)

                source?.postMessage(
                    {
                        type: 'observatory:snapshot',
                        data: payload,
                    },
                    '*'
                )
            } catch (err) {
                // Optionally log serialization errors
                console.warn('Observatory snapshot serialization failed:', err)
            }
        })
    }

    // Broadcast all registry data when devtools tab connects
    nuxtApp.hook('app:mounted', () => {
        broadcastAll()
    })

    // Broadcast on every route change (client-side navigation)
    if (import.meta.client && nuxtApp.vueApp.config.globalProperties.$router) {
        nuxtApp.vueApp.config.globalProperties.$router.afterEach(() => {
            broadcastAll()
        })
    }

    function broadcastAll() {
        if (!import.meta.client) {
            return
        }

        const channel = getDevtoolsChannel()

        if (!channel) {
            return
        }

        channel.send('observatory:snapshot', {
            fetch: fetchRegistry.getAll(),
            provideInject: provideInjectRegistry.getAll(),
            composables: composableRegistry.getAll(),
            renders: renderRegistry.getAll(),
            transitions: transitionRegistry.getAll(),
        })
    }

    function getDevtoolsChannel() {
        // Connects to @nuxt/devtools WS bridge if available
        return (window as ObservatoryWindow).__nuxt_devtools__?.channel ?? null
    }
})
