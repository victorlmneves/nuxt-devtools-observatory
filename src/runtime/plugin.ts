import { defineNuxtPlugin, useNuxtApp, useRuntimeConfig, useRouter } from '#app'
import { nextTick } from 'vue'
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

    const config = useRuntimeConfig().public.observatory as {
        heatmapThresholdCount: number
        heatmapThresholdTime: number
        clientOrigin?: string
        fetchDashboard?: boolean
        provideInjectGraph?: boolean
        composableTracker?: boolean
        renderHeatmap?: boolean
        transitionTracker?: boolean
    }

    // Enable Vue performance API for render heatmap if enabled
    if (config.renderHeatmap) {
        nuxtApp.vueApp.config.performance = true
    }

    // Only initialize registries for enabled features
    const registries: Record<string, unknown> = {}

    if (config.fetchDashboard) {
        registries.fetch = setupFetchRegistry()
    }

    if (config.provideInjectGraph) {
        registries.provideInject = setupProvideInjectRegistry()
    }

    if (config.composableTracker) {
        registries.composable = setupComposableRegistry()
    }

    if (config.renderHeatmap) {
        registries.render = setupRenderRegistry(nuxtApp, {
            isHydrating: () => (nuxtApp.isHydrating ?? false) && (nuxtApp.payload as { serverRendered?: boolean })?.serverRendered === true,
        })
    }

    if (config.transitionTracker) {
        registries.transition = setupTransitionRegistry()
    }

    // Expose registries globally so Vite transform shims can reach them.
    // This must happen synchronously — before any component setup() runs —
    // so that shims injected by the Vite transforms find the registry already
    // in place rather than silently no-opping on the first render.
    if (import.meta.client) {
        // Always clear any previous registry to avoid cross-project state
        delete (window as ObservatoryWindow).__observatory__
        ;(window as ObservatoryWindow).__observatory__ = registries

        // postMessage bridge — the Observatory SPA runs at localhost:4949 (cross-
        // origin). It cannot read window.top properties, but CAN send messages.
        // We register this listener immediately (not in app:mounted) so requests
        // arriving before hydration completes are handled correctly.
        // WeakRef prevents this closure from keeping the SPA iframe's Window object
        // alive if the DevTools panel is destroyed and recreated (e.g. on HMR).
        let lastMessageSourceRef: WeakRef<Window> | null = null
        let lastMessageOrigin = ''

        const messageHandler = (event: MessageEvent) => {
            if (config.clientOrigin && event.origin !== config.clientOrigin) {
                return
            }

            const type = event.data?.type

            if (type === 'observatory:request') {
                // Remember the SPA window so we can push unsolicited updates to it
                lastMessageSourceRef = event.source ? new WeakRef(event.source as Window) : null
                lastMessageOrigin = event.origin

                const source = event.source as Window | null
                source?.postMessage({ type: 'observatory:snapshot', data: buildSnapshot() }, event.origin)

                return
            }

            if (type === 'observatory:clear-composables') {
                if (composableRegistry) {
                    composableRegistry.clear()
                }

                // Push a fresh (now empty) snapshot back immediately
                const source = event.source as Window | null
                source?.postMessage({ type: 'observatory:snapshot', data: buildSnapshot() }, event.origin)
            }

            if (type === 'observatory:edit-composable') {
                const { id, key, value } = event.data as { id: string; key: string; value: unknown }

                if (composableRegistry) {
                    composableRegistry.editValue(id, key, value)
                }

                // The watchEffect inside the registry will call _onChange() which
                // pushes the updated snapshot automatically — no explicit broadcast needed.
            }

            if (type === 'observatory:open-in-editor') {
                // Delegate to Vite's built-in /__open-in-editor endpoint which is
                // present on every Vite dev server and handles VS Code / editor launch.
                // Vite's transform injects the full module id as the file path.
                // Strip the /@fs/ prefix (used for files outside the project root)
                // and any query string Vite appends (e.g. ?t=1234&vue&type=script).
                const { file } = event.data as { file: string }

                if (file && file !== 'unknown') {
                    const cleaned = file
                        .replace(/^\/@fs/, '') // strip Vite's /@fs/ virtual prefix
                        .replace(/\?.*$/, '') // strip query string
                    fetch(`/__open-in-editor?file=${encodeURIComponent(cleaned)}`).catch(() => {})
                }
            }
        }

        window.addEventListener('message', messageHandler)

        // Remove the listener when the Nuxt app tears down (including HMR-triggered
        // plugin re-registration), so re-evaluating this plugin never accumulates
        // duplicate listeners on window.
        nuxtApp.hook('app:beforeUnmount', () => {
            window.removeEventListener('message', messageHandler)
            lastMessageSourceRef = null
        })

        // Push a fresh snapshot to the SPA immediately when any tracked
        // composable's reactive state changes — no need to wait for the next poll.
        const composableRegistry = registries.composable as ReturnType<typeof setupComposableRegistry> | undefined

        if (composableRegistry && composableRegistry.onComposableChange) {
            composableRegistry.onComposableChange(() => {
                const lastMessageSource = lastMessageSourceRef?.deref()

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
        router.beforeEach(
            (_to: ReturnType<typeof useRouter>['currentRoute']['value'], from: ReturnType<typeof useRouter>['currentRoute']['value']) => {
                if (!from || from.name === undefined) {
                    return
                }
                const render = registries.render as unknown
                if (render && typeof (render as { reset?: () => void }).reset === 'function') (render as { reset: () => void }).reset()
                const provideInject = registries.provideInject as unknown
                if (provideInject && typeof (provideInject as { clear?: () => void }).clear === 'function')
                    (provideInject as { clear: () => void }).clear()
                const composable = registries.composable as unknown
                if (composable && typeof (composable as { clear?: () => void }).clear === 'function')
                    (composable as { clear: () => void }).clear()
                const transition = registries.transition as unknown
                if (transition && typeof (transition as { clear?: () => void }).clear === 'function')
                    (transition as { clear: () => void }).clear()
            }
        )

        // afterEach fires after the new route is fully committed and rendered.
        // Use nextTick so persistent component updated() hooks have flushed
        // before we broadcast — otherwise rerenders shows 0 on navigation.
        router.afterEach((to: ReturnType<typeof useRouter>['currentRoute']['value']) => {
            const composable = registries.composable as unknown

            if (composable && typeof (composable as { setRoute?: (path: string) => void }).setRoute === 'function') {
                ;(composable as { setRoute: (path: string) => void }).setRoute(to.path ?? '/')
            }

            const render = registries.render as unknown

            if (render && typeof (render as { setRoute?: (path: string) => void }).setRoute === 'function') {
                ;(render as { setRoute: (path: string) => void }).setRoute(to.path ?? '/')
            }

            nextTick(() => broadcastAll())
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
        // Always return a consistent object with all tracker keys present.
        function safeParse<T>(val: unknown, fallback: T): T {
            if (typeof val === 'string') {
                try {
                    return JSON.parse(val) as T
                } catch {
                    return fallback
                }
            }
            if (val && typeof val === 'object') {
                return val as T
            }
            return fallback
        }

        // Define the expected tracker keys and their fallbacks
        const trackerDefs = [
            { key: 'fetch', fallback: [] },
            { key: 'provideInject', fallback: { provides: [], injects: [] } },
            { key: 'composable', fallback: [] },
            { key: 'render', fallback: {} },
            { key: 'transition', fallback: {} },
        ] as const

        const snapshot: Record<string, unknown> = {}

        for (const { key, fallback } of trackerDefs) {
            const reg = registries[key] as unknown
            const hasGetSnapshot = reg && typeof (reg as { getSnapshot?: () => unknown }).getSnapshot === 'function'
            snapshot[key === 'composable' ? 'composables' : key === 'render' ? 'renders' : key === 'transition' ? 'transitions' : key] =
                hasGetSnapshot ? safeParse((reg as { getSnapshot: () => unknown }).getSnapshot(), fallback) : fallback
        }

        snapshot.features = {
            fetchDashboard: !!registries.fetch,
            provideInjectGraph: !!registries.provideInject,
            composableTracker: !!registries.composable,
            renderHeatmap: !!registries.render,
            transitionTracker: !!registries.transition,
        }

        return snapshot
    }

    function getDevtoolsChannel() {
        // Connects to @nuxt/devtools WS bridge if available
        return (window as ObservatoryWindow).__nuxt_devtools__?.channel ?? null
    }
})
