import type { H3Event } from 'h3'
import { setResponseHeader } from 'h3'

interface ObservatoryEvent extends H3Event {
    __ssrFetchStart?: number
}

interface NitroAppLike {
    hooks: {
        hook: (name: 'request' | 'afterResponse', handler: (event: H3Event) => void) => void
    }
}

// Nitro plugin: captures server-side $fetch calls and annotates
// responses with cache status headers for the client to detect.

export default function fetchCapturePlugin(nitroApp: NitroAppLike) {
    // Record request timing so the client can identify SSR-backed payloads.
    nitroApp.hooks.hook('request', (event) => {
        ;(event as ObservatoryEvent).__ssrFetchStart = performance.now()
    })

    nitroApp.hooks.hook('afterResponse', (event) => {
        const start = (event as ObservatoryEvent).__ssrFetchStart

        if (start) {
            const ms = Math.round(performance.now() - start)
            setResponseHeader(event, 'x-observatory-ssr-ms', String(ms))
        }
    })
}
