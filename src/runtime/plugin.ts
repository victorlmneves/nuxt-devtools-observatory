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

function toSerializable(value: unknown, seen = new WeakSet<object>()): unknown {
    if (value === null || value === undefined) {
        return value
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value
    }

    if (typeof value === 'bigint') {
        return value.toString()
    }

    if (typeof value === 'function' || typeof value === 'symbol') {
        return `[${typeof value}]`
    }

    if (Array.isArray(value)) {
        return value.map((entry) => toSerializable(entry, seen))
    }

    if (typeof value === 'object') {
        if (seen.has(value)) {
            return '[circular]'
        }

        seen.add(value)

        if (value instanceof Date) {
            return value.toISOString()
        }

        const plain: Record<string, unknown> = {}

        for (const [key, entry] of Object.entries(value)) {
            plain[key] = toSerializable(entry, seen)
        }

        seen.delete(value)
        return plain
    }

    return String(value)
}

export default defineNuxtPlugin(() => {
    if (!import.meta.dev) {
        return
    }

    const nuxtApp = useNuxtApp()
    const config = useRuntimeConfig().public.observatory as { heatmapThreshold: number; clientOrigin?: string }

    // Enable Vue performance API for render heatmap
    nuxtApp.vueApp.config.performance = true

    // Each registry attaches to the Vue app and exposes data over the WS channel
    const fetchRegistry = setupFetchRegistry()
    const provideInjectRegistry = setupProvideInjectRegistry()
    const composableRegistry = setupComposableRegistry()
    const renderRegistry = setupRenderRegistry(nuxtApp)
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

            if (config.clientOrigin && event.origin !== config.clientOrigin) {
                return
            }

            const source = event.source as Window | null
            const snapshot = buildSnapshot()
            source?.postMessage(
                {
                    type: 'observatory:snapshot',
                    data: snapshot,
                },
                event.origin
            )
        })
    }

    // Broadcast all registry data when devtools tab connects
    nuxtApp.hook('app:mounted', () => {
        broadcastAll()
    })

    // Broadcast on every route change (client-side navigation)
    if (import.meta.client && nuxtApp.vueApp.config.globalProperties.$router) {
        nuxtApp.vueApp.config.globalProperties.$router.beforeEach((_to: unknown, _from: unknown, next: () => void) => {
            renderRegistry.reset()
            next()
        })

        nuxtApp.vueApp.config.globalProperties.$router.afterEach(() => {
            renderRegistry.markNavigation()
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

        channel.send('observatory:snapshot', buildSnapshot())
    }

    function buildSnapshot() {
        return toSerializable({
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
