import { getRequestURL, setResponseHeader, type H3Event } from 'h3'
import { createSsrRecord, drainSsrRecord, type SsrTraceRecord } from './ssr-trace-store'

interface ObservatoryContext {
    __observatoryRequestId?: string
    __ssrFetchStart?: number
}

// Nitro plugins receive plain H3Event objects; extend the context inline.
type ObservatoryEvent = H3Event & { context: H3Event['context'] & ObservatoryContext }

// Nitro's render:html HTML context (subset of NitroRenderHTMLContext).
interface NitroRenderHTMLContext {
    island?: boolean
    html: string
    head: string[]
    bodyPrepend: string[]
    body: string[]
    bodyAppend: string[]
}

interface NitroAppLike {
    hooks: {
        // Use a broad signature so we can register all three hook names without
        // TypeScript requiring a union-overloaded interface.
        hook: (name: string, handler: (...args: unknown[]) => void) => void
    }
}

let _requestCounter = 0

function newRequestId(): string {
    _requestCounter = (_requestCounter + 1) % 999_999

    return `req_${Date.now()}_${_requestCounter}`
}

// Nitro plugin: captures SSR request timing and injects a trace record into
// the rendered HTML so the client Observatory plugin can pick it up.
export default function fetchCapturePlugin(nitroApp: NitroAppLike) {
    // ── request ────────────────────────────────────────────────────────────
    // Open a per-request SSR trace record and stamp the request start time.
    nitroApp.hooks.hook('request', (...args: unknown[]) => {
        const event = args[0] as ObservatoryEvent

        const start = performance.now()
        event.context.__ssrFetchStart = start

        let route = '/'
        try {
            route = getRequestURL(event).pathname
        } catch (error) {
            console.error('Error getting request URL:', error)
        }

        const method = String((event as H3Event & { method?: string }).method ?? event.node?.req?.method ?? 'GET').toUpperCase()

        const requestId = newRequestId()
        event.context.__observatoryRequestId = requestId

        createSsrRecord(requestId, route, method)
    })

    // ── afterResponse ──────────────────────────────────────────────────────
    // Annotate the response with total SSR duration for easy identification.
    // Also drain any record that was never picked up by render:html (e.g. API
    // routes or error responses that do not render HTML).
    nitroApp.hooks.hook('afterResponse', (...args: unknown[]) => {
        const event = args[0] as ObservatoryEvent
        const start = event.context.__ssrFetchStart

        if (start !== undefined) {
            const ms = Math.round(performance.now() - start)
            setResponseHeader(event, 'x-observatory-ssr-ms', String(ms))
        }

        // Drain leftover record so the Map does not grow for non-HTML responses.
        const requestId = event.context.__observatoryRequestId

        if (requestId) {
            const durationMs = start !== undefined ? Math.max(performance.now() - start, 0) : 0
            drainSsrRecord(requestId, durationMs)
        }
    })

    // ── render:html ────────────────────────────────────────────────────────
    // Inject the completed SSR trace as inline JSON so the client plugin can
    // merge it into the client-side traceStore on startup.
    nitroApp.hooks.hook('render:html', (...args: unknown[]) => {
        const html = args[0] as NitroRenderHTMLContext
        const ctx = args[1] as { event: ObservatoryEvent }
        const event = ctx?.event

        if (!event) {
            return
        }

        const requestId = event.context.__observatoryRequestId
        const start = event.context.__ssrFetchStart

        if (!requestId) {
            return
        }

        const durationMs = start !== undefined ? Math.max(performance.now() - start, 0) : 0
        const record: SsrTraceRecord | undefined = drainSsrRecord(requestId, durationMs)

        if (!record) {
            return
        }

        // Inject as a JSON script block. The closing </script> tag is escaped
        // to prevent the parser from treating it as the end of a real script.
        const json = JSON.stringify(record).replace(/<\/script>/gi, '<\\/script>')
        html.bodyAppend.push(`<script id="__observatory_ssr_spans__" type="application/json">${json}</script>`)
    })
}
