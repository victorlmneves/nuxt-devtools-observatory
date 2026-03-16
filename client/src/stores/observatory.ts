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

const POLL_MS = 500

export interface TransitionEntry {
    id: string
    transitionName: string
    parentComponent: string
    direction: 'enter' | 'leave'
    phase: 'entering' | 'entered' | 'leaving' | 'left' | 'enter-cancelled' | 'leave-cancelled'
    startTime: number
    endTime?: number
    durationMs?: number
    cancelled: boolean
    appear: boolean
    mode?: string
}

interface ObservatorySnapshot {
    transitions?: TransitionEntry[]
}

export function useObservatoryData() {
    const transitions = ref<TransitionEntry[]>([])
    const connected = ref(false)

    function request() {
        window.top?.postMessage({ type: 'observatory:request' }, '*')
    }

    function onMessage(event: MessageEvent) {
        if (event.data?.type !== 'observatory:snapshot') {
            return
        }

        const data = event.data.data as ObservatorySnapshot
        transitions.value = data.transitions ?? []
        connected.value = true
    }

    window.addEventListener('message', onMessage)
    const timer = setInterval(request, POLL_MS)
    request() // immediate first request

    onUnmounted(() => {
        window.removeEventListener('message', onMessage)
        clearInterval(timer)
    })

    return { transitions, connected }
}
