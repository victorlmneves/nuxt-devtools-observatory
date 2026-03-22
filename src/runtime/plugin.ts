import { defineNuxtPlugin, useNuxtApp, useRuntimeConfig, useRouter } from '#app'
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
    const renderRegistry = setupRenderRegistry(nuxtApp, {
        isHydrating: () => nuxtApp.isHydrating ?? false,
    })
    const transitionRegistry = setupTransitionRegistry()

    // Expose registries globally so Vite transform shims can reach them.
    // This must happen synchronously — before any component setup() runs —
    // so that shims injected by the Vite transforms find the registry already
    // in place rather than silently no-opping on the first render.
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
        let lastMessageSource: Window | null = null
        let lastMessageOrigin = ''

        window.addEventListener('message', (event: MessageEvent) => {
            if (config.clientOrigin && event.origin !== config.clientOrigin) {
                return
            }

            const type = event.data?.type

            if (type === 'observatory:request') {
                // Remember the SPA window so we can push unsolicited updates to it
                lastMessageSource = event.source as Window | null
                lastMessageOrigin = event.origin

                const source = event.source as Window | null
                source?.postMessage({ type: 'observatory:snapshot', data: buildSnapshot() }, event.origin)

                return
            }

            if (type === 'observatory:clear-composables') {
                composableRegistry.clear()

                // Push a fresh (now empty) snapshot back immediately
                const source = event.source as Window | null
                source?.postMessage({ type: 'observatory:snapshot', data: buildSnapshot() }, event.origin)
            }
        })

        // Push a fresh snapshot to the SPA immediately when any tracked
        // composable's reactive state changes — no need to wait for the next poll.
        composableRegistry.onComposableChange(() => {
            if (!lastMessageSource || !lastMessageOrigin) {
                return
            }

            lastMessageSource.postMessage(
                {
                    type: 'observatory:snapshot',
                    data: buildSnapshot(),
                },
                lastMessageOrigin
            )
        })
    }

    // Broadcast all registry data when devtools tab connects
    nuxtApp.hook('app:mounted', () => {
        broadcastAll()
    })

    if (import.meta.client) {
        const router = useRouter()

        // router.beforeEach fires BEFORE Vue renders anything for the new route —
        // no new setup() has run yet, so clearing here is safe and race-free.
        // page:start (Suspense.onPending) fires AFTER synchronous setup() runs,
        // which causes clear() to wipe entries that were just registered.
        router.beforeEach(() => {
            renderRegistry.reset()
            ;(provideInjectRegistry as { clear?: () => void }).clear?.()
            composableRegistry.clear()
        })

        // afterEach fires after the new route is fully committed and rendered.
        // Safe to stamp the route and broadcast the fresh snapshot.
        router.afterEach((to: ReturnType<typeof useRouter>['currentRoute']['value']) => {
            composableRegistry.setRoute(to.path ?? '/')
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
