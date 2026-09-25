import { getRequestURL, setResponseHeader, type H3Event } from 'h3'
import { clearSsrRequestContext, enterSsrRequestContext } from './ssr-request-context'
import {
    addSsrPhaseSpan,
    createSsrRecord,
    drainSsrRecord,
    getArchivedSsrRecords,
    markSsrRecordDocument,
    markSsrRecordError,
    setSsrArchiveCap,
    snapshotSsrRecord,
    type SsrTraceRecord,
} from './ssr-trace-store'

export const NITRO_TIMELINE_PATH = '/__observatory/nitro-timeline'

interface IObservatoryContext {
    __observatoryRequestId?: string
    __ssrFetchStart?: number
    cache?: unknown
    matchedRoute?: { path?: string }
}

interface IObservatoryNode {
    req?: { method?: string }
    res?: {
        statusCode?: number
        getHeader?: (name: string) => string | number | string[] | undefined
    }
}

// Nitro plugins receive plain H3Event objects; extend the context inline.
type TObservatoryEvent = Omit<H3Event, 'node' | 'context'> & {
    context: H3Event['context'] & IObservatoryContext
    method?: string
    node?: IObservatoryNode
}

// Nitro's render:html HTML context (subset of NitroRenderHTMLContext).
interface INitroRenderHTMLContext {
    island?: boolean
    html: string
    head: string[]
    bodyPrepend: string[]
    body: string[]
    bodyAppend: string[]
}

type TH3StackHandler = ((event: unknown) => unknown) & { __observatoryWrapped?: boolean; name?: string }

interface IH3StackLayer {
    route?: string
    handler?: TH3StackHandler
}

interface INitroAppLike {
    hooks: {
        // Use a broad signature so we can register all three hook names without
        // TypeScript requiring a union-overloaded interface.
        hook: (name: string, handler: (...args: unknown[]) => void) => void
    }
    router?: {
        get?: (path: string, handler: (event: unknown) => unknown) => void
        use?: (path: string, handler: (event: unknown) => unknown) => void
    }
    h3App?: {
        stack?: IH3StackLayer[]
        use?: (path: string, handler: (event: unknown) => unknown) => void
    }
}

let _requestCounter = 0
let middlewareWrapped = false

function newRequestId(): string {
    _requestCounter = (_requestCounter + 1) % 999_999

    return `req_${Date.now()}_${_requestCounter}`
}

function applyArchiveCapFromEnv(): void {
    const raw = typeof process !== 'undefined' ? process.env?.OBSERVATORY_MAX_TRACES : undefined
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN

    if (Number.isFinite(parsed) && parsed > 0) {
        setSsrArchiveCap(parsed)
    }
}

function relativeMs(start: number, at = performance.now()): number {
    return Math.max(at - start, 0)
}

function readStatusCode(event: TObservatoryEvent): number | undefined {
    const nodeStatus = event.node?.res?.statusCode

    if (typeof nodeStatus === 'number') {
        return nodeStatus
    }

    const contextStatus = (event.context as { _status?: unknown })._status

    if (typeof contextStatus === 'number') {
        return contextStatus
    }

    return undefined
}

function readMatchedRoute(event: TObservatoryEvent): string | undefined {
    const matched = event.context.matchedRoute?.path

    if (typeof matched === 'string' && matched.length > 0) {
        return matched
    }

    const path = (event as { path?: unknown }).path

    return typeof path === 'string' ? path : undefined
}

function normalizeCacheHeader(header: string | number | string[] | undefined): string | undefined {
    if (typeof header === 'string') {
        return header.toLowerCase()
    }

    if (typeof header === 'number') {
        return String(header).toLowerCase()
    }

    if (!Array.isArray(header) || header.length === 0) {
        return undefined
    }

    const first = header[0]

    return typeof first === 'string' ? first.toLowerCase() : undefined
}

function readCacheStatus(event: TObservatoryEvent): 'hit' | 'miss' | undefined {
    const cache = event.context.cache

    if (cache && typeof cache === 'object') {
        const rec = cache as Record<string, unknown>

        if (rec.status === 'hit' || rec.status === 'miss') {
            return rec.status
        }

        if (typeof rec.hit === 'boolean') {
            return rec.hit ? 'hit' : 'miss'
        }
    }

    const header = event.node?.res?.getHeader?.('x-nitro-cache')
    const normalized = normalizeCacheHeader(header)

    if (normalized === 'hit' || normalized === 'miss') {
        return normalized
    }

    return undefined
}

function resolveEventFromHookArgs(args: unknown[]): TObservatoryEvent | undefined {
    const first = args[0]

    if (first && typeof first === 'object' && 'context' in first) {
        return first as TObservatoryEvent
    }

    const second = args[1]

    if (second && typeof second === 'object' && 'event' in second) {
        return (second as { event?: TObservatoryEvent }).event
    }

    if (second && typeof second === 'object' && 'context' in second) {
        return second as TObservatoryEvent
    }

    return undefined
}

function resolveMiddlewareLayerName(layer: IH3StackLayer, original: TH3StackHandler): string {
    if (typeof layer.route === 'string' && layer.route.length > 0) {
        return layer.route
    }

    if (original.name && original.name !== 'handler') {
        return original.name
    }

    return 'anonymous'
}

function wrapH3Middleware(nitroApp: INitroAppLike): boolean {
    const stack = nitroApp.h3App?.stack

    if (!Array.isArray(stack) || stack.length === 0) {
        return false
    }

    let wrapped = 0

    for (const layer of stack) {
        const original = layer.handler

        if (typeof original !== 'function' || original.__observatoryWrapped) {
            continue
        }

        const layerName = resolveMiddlewareLayerName(layer, original)

        const wrappedHandler = ((event: unknown) => {
            const observatoryEvent = event as TObservatoryEvent
            const requestId = observatoryEvent?.context?.__observatoryRequestId
            const start = observatoryEvent?.context?.__ssrFetchStart
            const t0 = performance.now()

            const finish = () => {
                if (!requestId || start === undefined) {
                    return
                }

                addSsrPhaseSpan(requestId, {
                    name: `nitro:middleware:${layerName}`,
                    type: 'server',
                    startMs: relativeMs(start, t0),
                    endMs: relativeMs(start),
                    metadata: {
                        hook: 'middleware',
                        name: layerName,
                    },
                })
            }

            try {
                const result = original(event)

                if (result && typeof (result as Promise<unknown>).then === 'function') {
                    return Promise.resolve(result).finally(finish)
                }

                finish()

                return result
            } catch (error) {
                finish()
                throw error
            }
        }) as TH3StackHandler

        if (wrappedHandler) {
            wrappedHandler.__observatoryWrapped = true
        }

        layer.handler = wrappedHandler
        wrapped++
    }

    return wrapped > 0
}

function registerTimelineEndpoint(nitroApp: INitroAppLike): void {
    if (!import.meta.dev) {
        return
    }

    const handler = (event: unknown) => {
        const observatoryEvent = event as TObservatoryEvent
        const method = String(observatoryEvent.method ?? observatoryEvent.node?.req?.method ?? 'GET').toUpperCase()

        if (method !== 'GET') {
            return []
        }

        return getArchivedSsrRecords()
    }

    if (typeof nitroApp.router?.get === 'function') {
        nitroApp.router.get(NITRO_TIMELINE_PATH, handler)

        return
    }

    if (typeof nitroApp.router?.use === 'function') {
        nitroApp.router.use(NITRO_TIMELINE_PATH, handler)

        return
    }

    nitroApp.h3App?.use?.(NITRO_TIMELINE_PATH, handler)
}

function addFallbackMiddlewareSpan(requestId: string, start: number): void {
    if (middlewareWrapped) {
        return
    }

    addSsrPhaseSpan(requestId, {
        name: 'nitro:middleware',
        type: 'server',
        startMs: 0,
        endMs: relativeMs(start),
        metadata: {
            hook: 'middleware',
            fallback: true,
        },
    })
}

// Nitro plugin: captures SSR request timing and injects a trace record into
// the rendered HTML so the client Observatory plugin can pick it up.
export default function fetchCapturePlugin(nitroApp: INitroAppLike) {
    applyArchiveCapFromEnv()
    middlewareWrapped = wrapH3Middleware(nitroApp)
    registerTimelineEndpoint(nitroApp)

    // ── request ────────────────────────────────────────────────────────────
    // Open a per-request SSR trace record and stamp the request start time.
    nitroApp.hooks.hook('request', (...args: unknown[]) => {
        if (!middlewareWrapped) {
            middlewareWrapped = wrapH3Middleware(nitroApp)
        }

        const event = args[0] as TObservatoryEvent

        let route = '/'
        try {
            route = getRequestURL(event).pathname
        } catch (error) {
            console.error('Error getting request URL:', error)
        }

        if (route === NITRO_TIMELINE_PATH) {
            return
        }

        const start = performance.now()
        event.context.__ssrFetchStart = start

        const method = String((event as H3Event & { method?: string }).method ?? event.node?.req?.method ?? 'GET').toUpperCase()

        const requestId = newRequestId()
        event.context.__observatoryRequestId = requestId

        createSsrRecord(requestId, route, method)
        enterSsrRequestContext({
            __observatoryRequestId: requestId,
            __ssrFetchStart: start,
        })
    })

    // ── beforeResponse ─────────────────────────────────────────────────────
    // Close the handler span and label cached handlers when context is present.
    nitroApp.hooks.hook('beforeResponse', (...args: unknown[]) => {
        const hookStart = performance.now()
        const event = args[0] as TObservatoryEvent
        const requestId = event?.context?.__observatoryRequestId
        const start = event?.context?.__ssrFetchStart

        if (!requestId || start === undefined) {
            return
        }

        addFallbackMiddlewareSpan(requestId, start)

        const path = (() => {
            try {
                return getRequestURL(event).pathname
            } catch {
                return readMatchedRoute(event) ?? '/'
            }
        })()
        const method = String((event as H3Event & { method?: string }).method ?? event.node?.req?.method ?? 'GET').toUpperCase()
        const statusCode = readStatusCode(event)
        const matchedRoute = readMatchedRoute(event)
        const cache = readCacheStatus(event)

        addSsrPhaseSpan(requestId, {
            name: 'nitro:handler',
            type: 'server',
            startMs: 0,
            endMs: relativeMs(start, hookStart),
            metadata: {
                hook: 'beforeResponse',
                path,
                method,
                statusCode,
                matchedRoute,
                ...(cache ? { cache } : {}),
            },
        })

        if (cache) {
            addSsrPhaseSpan(requestId, {
                name: 'nitro:cached',
                type: 'server',
                startMs: 0,
                endMs: relativeMs(start),
                metadata: {
                    hook: 'beforeResponse',
                    cache,
                    path,
                    method,
                    statusCode,
                },
            })
        }
    })

    // ── error ──────────────────────────────────────────────────────────────
    nitroApp.hooks.hook('error', (...args: unknown[]) => {
        const hookStart = performance.now()
        const event = resolveEventFromHookArgs(args)
        const requestId = event?.context?.__observatoryRequestId
        const start = event?.context?.__ssrFetchStart

        if (!requestId) {
            return
        }

        markSsrRecordError(requestId)

        if (start !== undefined) {
            addSsrPhaseSpan(requestId, {
                name: 'nitro:error',
                type: 'server',
                startMs: relativeMs(start, hookStart),
                endMs: relativeMs(start),
                error: true,
                metadata: {
                    hook: 'error',
                },
            })
        }
    })

    // ── afterResponse ──────────────────────────────────────────────────────
    // Annotate the response with total SSR duration for easy identification.
    // Drain leftover records (document and API) so they are archived once.
    nitroApp.hooks.hook('afterResponse', (...args: unknown[]) => {
        const hookStart = performance.now()
        const event = args[0] as TObservatoryEvent
        const start = event.context.__ssrFetchStart

        if (start !== undefined) {
            const ms = Math.round(performance.now() - start)
            setResponseHeader(event, 'x-observatory-ssr-ms', String(ms))
        }

        const requestId = event.context.__observatoryRequestId

        if (requestId) {
            if (start !== undefined) {
                const hookEnd = performance.now()
                addSsrPhaseSpan(requestId, {
                    name: 'ssr:afterResponse',
                    type: 'server',
                    startMs: Math.max(hookStart - start, 0),
                    endMs: Math.max(hookEnd - start, 0),
                    metadata: {
                        hook: 'afterResponse',
                    },
                })
            }

            const durationMs = start !== undefined ? Math.max(performance.now() - start, 0) : 0
            drainSsrRecord(requestId, durationMs)
            clearSsrRequestContext(requestId)
        }
    })

    // ── render:html ────────────────────────────────────────────────────────
    // Inject a snapshot of the SSR trace as inline JSON. Do not drain here so
    // beforeResponse / afterResponse can still append spans; archive happens
    // on afterResponse.
    nitroApp.hooks.hook('render:html', (...args: unknown[]) => {
        const hookStart = performance.now()
        const html = args[0] as INitroRenderHTMLContext
        const ctx = args[1] as { event: TObservatoryEvent }
        const event = ctx?.event

        if (!event) {
            return
        }

        const requestId = event.context.__observatoryRequestId
        const start = event.context.__ssrFetchStart

        if (!requestId) {
            return
        }

        markSsrRecordDocument(requestId)

        if (start !== undefined) {
            const hookEnd = performance.now()
            addSsrPhaseSpan(requestId, {
                name: 'ssr:render:html',
                type: 'server',
                startMs: Math.max(hookStart - start, 0),
                endMs: Math.max(hookEnd - start, 0),
                metadata: {
                    hook: 'render:html',
                    island: html.island === true,
                },
            })
        }

        const durationMs = start !== undefined ? Math.max(performance.now() - start, 0) : 0
        const record: SsrTraceRecord | undefined = snapshotSsrRecord(requestId, durationMs)

        if (!record) {
            return
        }

        // Inject as a JSON script block. The closing </script> tag is escaped
        // to prevent the parser from treating it as the end of a real script.
        const json = JSON.stringify(record).replace(/<\/script>/gi, String.raw`<\/script>`)
        html.bodyAppend.push(`<script id="__observatory_ssr_spans__" type="application/json">${json}</script>`)
    })
}
