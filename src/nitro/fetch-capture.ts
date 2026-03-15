// Nitro plugin: captures server-side $fetch calls and annotates
// responses with cache status headers for the client to detect.

export default defineNitroPlugin((nitroApp) => {
    // Hook into h3 event responses to inject cache header
    nitroApp.hooks.hook('request', (event) => {
        const originalFetch = globalThis.$fetch

        // Wrap $fetch on each request to capture SSR timing
        ;(event as any).__ssrFetchStart = performance.now()
    })

    nitroApp.hooks.hook('afterResponse', (event, response) => {
        const start = (event as any).__ssrFetchStart
        if (start && response) {
            const ms = Math.round(performance.now() - start)
            // Attach timing to response headers for client devtools to read
            response.headers?.set('x-observatory-ssr-ms', String(ms))
        }
    })
})
