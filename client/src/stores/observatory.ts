/**
 * useObservatoryData — live bridge between the Nuxt app and the client SPA.
 *
 * The client SPA runs at localhost:4949 (cross-origin from the Nuxt app at
 * localhost:3000). Direct window.top property access is blocked by the browser.
 * However postMessage IS allowed cross-origin:
 *
 *   iframe (4949)  →  window.top.postMessage({ type: 'observatory:request' })  →  Nuxt page (3000)
 *   Nuxt plugin.ts →  event.source.postMessage({ type: 'observatory:snapshot', data })  →  iframe
 *
 * The plugin.ts listener is registered immediately on plugin init (not deferred
 * to app:mounted) so requests sent before full hydration are answered correctly.
 */

import { ref, onUnmounted } from 'vue'

export interface TransitionEntry {
    id: string
    transitionName: string
    parentComponent: string
    direction: 'enter' | 'leave'
    phase: 'entering' | 'entered' | 'leaving' | 'left' | 'enter-cancelled' | 'leave-cancelled' | 'interrupted'
    startTime: number
    endTime?: number
    durationMs?: number
    cancelled: boolean
    appear: boolean
    mode?: string
}

export interface FetchEntry {
    id: string
    key: string
    url: string
    status: 'pending' | 'ok' | 'error' | 'cached'
    origin: 'ssr' | 'csr'
    ms?: number
    size?: number
    cached: boolean
    payload?: unknown
    file?: string
    line?: number
    startOffset?: number
}

interface ComposableEntry {
    id: string
    name: string
    component: string
    instances: number
    status: 'mounted' | 'unmounted'
    leak: boolean
    leakReason?: string
    refs: Array<{ key: string; type: string; val: string }>
    watchers: number
    intervals: number
    lifecycle: { onMounted: boolean; onUnmounted: boolean; watchersCleaned: boolean; intervalsCleaned: boolean }
}

interface ProvideInjectNode {
    id: string
    label: string
    type: 'provider' | 'consumer' | 'both' | 'error'
    provides: Array<{ key: string; val: string; reactive: boolean }>
    injects: Array<{ key: string; from: string | null; ok: boolean }>
    children: ProvideInjectNode[]
}

interface RenderNode {
    id: string
    label: string
    file: string
    renders: number
    avgMs: number
    triggers: string[]
    children: RenderNode[]
}

interface ObservatorySnapshot {
    transitions?: TransitionEntry[]
    fetch?: FetchEntry[]
    composables?: ComposableEntry[]
    provideInject?: ProvideInjectNode[]
    renders?: RenderNode[]
}

const POLL_MS = 500

export function useObservatoryData() {
    const transitions = ref<TransitionEntry[]>([])
    const fetches = ref<FetchEntry[]>([])
    const composables = ref<ComposableEntry[]>([])
    const provideInject = ref<ProvideInjectNode[]>([])
    const renders = ref<RenderNode[]>([])
    const connected = ref(false)

    function request() {
        window.top?.postMessage({ type: 'observatory:request' }, '*')
    }

    function onMessage(event: MessageEvent) {
        if (event.data?.type !== 'observatory:snapshot') {
            return
        }

        let data: ObservatorySnapshot | null = null

        if (typeof event.data.data === 'string') {
            try {
                data = JSON.parse(event.data.data)
            } catch (err) {
                console.warn('Failed to parse observatory snapshot:', err)

                data = null
            }
        } else {
            data = event.data.data as ObservatorySnapshot
        }

        transitions.value = data?.transitions ?? []
        fetches.value = data?.fetch ?? []
        composables.value = data?.composables ?? []

        // Always guarantee provideInject.value is an array
        const pi = data?.provideInject

        if (Array.isArray(pi)) {
            provideInject.value = pi
        } else if (pi && typeof pi === 'object') {
            // If registry returns { provides, injects }, build a single node
            provideInject.value = [
                {
                    provides: Array.isArray(pi.provides) ? pi.provides : [],
                    injects: Array.isArray(pi.injects) ? pi.injects : [],
                    id: 'root',
                    label: 'Provide/Inject Root',
                    type: 'both',
                    children: [],
                },
            ]
        } else {
            provideInject.value = []
        }

        if (!Array.isArray(provideInject.value)) {
            provideInject.value = []
        }

        renders.value = data?.renders ?? []
        connected.value = true
    }

    window.addEventListener('message', onMessage)
    const timer = setInterval(request, POLL_MS)
    request() // immediate first request

    onUnmounted(() => {
        window.removeEventListener('message', onMessage)
        clearInterval(timer)
    })

    return { transitions, fetches, composables, provideInject, renders, connected }
}
