import { defineNitroPlugin } from '#imports'
// Nitro plugin: captures server-side $fetch calls and annotates
// responses with cache status headers for the client to detect.

export default defineNitroPlugin((nitroApp) => {
    // Define a type for the event object that allows attaching __ssrFetchStart
    type EventWithSSRFetchStart = { [key: string]: unknown; __ssrFetchStart?: number }

    // Hook into h3 event responses to inject cache header
    nitroApp.hooks.hook('request', (event: EventWithSSRFetchStart) => {
        const originalFetch = globalThis.$fetch

        // Wrap $fetch on each request to capture SSR timing
        event.__ssrFetchStart = performance.now()
    })

    nitroApp.hooks.hook('afterResponse', (event: EventWithSSRFetchStart, response) => {
        const start = event.__ssrFetchStart

        if (start && response) {
            const ms = Math.round(performance.now() - start)
            // Attach timing to response headers for client devtools to read
            response.headers?.set('x-observatory-ssr-ms', String(ms))
        }
    })
})
