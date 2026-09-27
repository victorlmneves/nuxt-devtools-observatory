import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { getSsrRequestContext } from '../../src/runtime/nitro/ssr-request-context'
import { clearSsrArchive, getArchivedSsrRecords, setSsrArchiveCap } from '../../src/runtime/nitro/ssr-trace-store'

let requestHook: (event: Record<string, unknown>) => void
let afterResponseHook: (event: Record<string, unknown>) => void
let beforeResponseHook: (event: Record<string, unknown>) => void
let renderHtmlHook: (html: { bodyAppend: string[] }, ctx: { event: Record<string, unknown> }) => void
let errorHook: (...args: unknown[]) => void
let timelineHandler: ((event: Record<string, unknown>) => unknown) | undefined
const middlewareLayer = {
    route: 'auth',
    handler: (event: unknown) => event,
}

const setResponseHeader = vi.fn()
const getRequestURL = vi.fn().mockReturnValue(new URL('http://localhost/dashboard'))

vi.mock('h3', () => ({
    setResponseHeader,
    getRequestURL,
}))

beforeAll(async () => {
    const mod = await import('../../src/runtime/nitro/fetch-capture')

    mod.default({
        hooks: {
            hook(name: string, handler: unknown) {
                if (name === 'request') requestHook = handler as typeof requestHook
                if (name === 'afterResponse') afterResponseHook = handler as typeof afterResponseHook
                if (name === 'beforeResponse') beforeResponseHook = handler as typeof beforeResponseHook
                if (name === 'render:html') renderHtmlHook = handler as typeof renderHtmlHook
                if (name === 'error') errorHook = handler as typeof errorHook
            },
        },
        router: {
            get(path: string, handler: (event: unknown) => unknown) {
                if (path === '/__observatory/nitro-timeline') {
                    timelineHandler = handler as typeof timelineHandler
                }
            },
        },
        h3App: {
            stack: [middlewareLayer],
        },
    })
})

beforeEach(() => {
    clearSsrArchive()
    setSsrArchiveCap(50)
    getRequestURL.mockReturnValue(new URL('http://localhost/dashboard'))
})

function makeEvent(extra: Record<string, unknown> = {}): {
    context: Record<string, unknown>
    node?: { req?: { method?: string }; res?: { statusCode?: number; getHeader?: (name: string) => string | undefined } }
    method?: string
} {
    return { context: { ...extra } }
}

describe('fetch-capture nitro plugin', () => {
    it('stamps event.context.__ssrFetchStart with a numeric timestamp on request', () => {
        const event = makeEvent()

        requestHook(event as unknown as Record<string, unknown>)

        expect(typeof event.context.__ssrFetchStart).toBe('number')
        expect(event.context.__ssrFetchStart as number).toBeGreaterThan(0)
    })

    it('assigns a string requestId to event.context.__observatoryRequestId', () => {
        const event = makeEvent()

        requestHook(event as unknown as Record<string, unknown>)

        expect(typeof event.context.__observatoryRequestId).toBe('string')
        expect((event.context.__observatoryRequestId as string).length).toBeGreaterThan(0)

        expect(getSsrRequestContext()?.__observatoryRequestId).toBe(event.context.__observatoryRequestId)
    })

    it('sets the x-observatory-ssr-ms response header after a response', () => {
        const event = makeEvent()

        requestHook(event as unknown as Record<string, unknown>)
        const callsBefore = setResponseHeader.mock.calls.length
        afterResponseHook(event as unknown as Record<string, unknown>)

        expect(setResponseHeader.mock.calls.length).toBeGreaterThan(callsBefore)
        const lastCall = setResponseHeader.mock.calls.at(-1)!
        expect(lastCall[1]).toBe('x-observatory-ssr-ms')
        expect(Number(lastCall[2])).toBeGreaterThanOrEqual(0)

        expect(getSsrRequestContext()).toBeUndefined()
    })

    it('the elapsed ms in the header is a non-negative integer', () => {
        const event = makeEvent()

        requestHook(event as unknown as Record<string, unknown>)
        afterResponseHook(event as unknown as Record<string, unknown>)

        const ms = Number(setResponseHeader.mock.calls.at(-1)?.[2])

        expect(Number.isInteger(ms)).toBe(true)
        expect(ms).toBeGreaterThanOrEqual(0)
    })

    it('does NOT set the header when the event has no __ssrFetchStart', () => {
        const event = makeEvent()
        // No requestHook called — context is empty

        const callsBefore = setResponseHeader.mock.calls.length
        afterResponseHook(event as unknown as Record<string, unknown>)

        expect(setResponseHeader.mock.calls).toHaveLength(callsBefore)
    })

    it('injects a JSON script tag into html.bodyAppend on render:html', () => {
        const event = makeEvent()

        requestHook(event as unknown as Record<string, unknown>)

        const html = { bodyAppend: [] as string[] }
        renderHtmlHook(html, { event: event as unknown as Record<string, unknown> })

        expect(html.bodyAppend).toHaveLength(1)
        expect(html.bodyAppend[0]).toContain('<script id="__observatory_ssr_spans__"')
        expect(html.bodyAppend[0]).toContain('type="application/json"')

        // The JSON must be parseable and contain a traceId and spans array.
        const match = html.bodyAppend[0].match(/>(.+)<\/script>/)
        const parsed = JSON.parse(match![1])

        expect(typeof parsed.traceId).toBe('string')
        expect(parsed.name).toBe('ssr:/dashboard')
        expect(Array.isArray(parsed.spans)).toBe(true)
        expect(parsed.spans.length).toBeGreaterThan(0)

        const names = parsed.spans.map((span: { name?: string }) => span.name)

        expect(names).toContain('ssr:navigation')
        expect(names).toContain('ssr:render:html')
    })

    it('does nothing in render:html when the event has no requestId', () => {
        const event = makeEvent() // no requestHook call

        const html = { bodyAppend: [] as string[] }
        renderHtmlHook(html, { event: event as unknown as Record<string, unknown> })

        expect(html.bodyAppend).toHaveLength(0)
    })

    it('archives document traces as ssr:<path> after afterResponse', () => {
        const event = makeEvent()

        requestHook(event as unknown as Record<string, unknown>)
        renderHtmlHook({ bodyAppend: [] }, { event: event as unknown as Record<string, unknown> })
        afterResponseHook(event as unknown as Record<string, unknown>)

        expect(getArchivedSsrRecords()[0]?.name).toBe('ssr:/dashboard')
    })

    it('archives an API-style request after afterResponse without render:html', () => {
        getRequestURL.mockReturnValue(new URL('http://localhost/api/hello'))
        const event = makeEvent()

        requestHook(event as unknown as Record<string, unknown>)
        beforeResponseHook(event as unknown as Record<string, unknown>)
        afterResponseHook(event as unknown as Record<string, unknown>)

        const archived = getArchivedSsrRecords()
        expect(archived).toHaveLength(1)
        expect(archived[0].name).toBe('nitro:GET /api/hello')

        const names = archived[0].spans.map((span) => span.name)
        expect(names).toContain('nitro:handler')
        expect(names).toContain('ssr:afterResponse')
    })

    it('records cache hit metadata as nitro:cached', () => {
        const event = makeEvent({ cache: { status: 'hit' } })

        requestHook(event as unknown as Record<string, unknown>)
        beforeResponseHook(event as unknown as Record<string, unknown>)
        afterResponseHook(event as unknown as Record<string, unknown>)

        const cached = getArchivedSsrRecords()[0].spans.find((span) => span.name === 'nitro:cached')

        expect(cached).toBeDefined()
        expect(cached?.metadata?.cache).toBe('hit')
        expect(cached?.type).toBe('server')
    })

    it('records cache miss metadata when context.cache.hit is false', () => {
        const event = makeEvent({ cache: { hit: false } })

        requestHook(event as unknown as Record<string, unknown>)
        beforeResponseHook(event as unknown as Record<string, unknown>)
        afterResponseHook(event as unknown as Record<string, unknown>)

        expect(getArchivedSsrRecords()[0].spans.find((span) => span.name === 'nitro:cached')?.metadata?.cache).toBe('miss')
    })

    it('marks the navigation span error from the error hook', () => {
        const event = makeEvent()

        requestHook(event as unknown as Record<string, unknown>)
        errorHook(new Error('boom'), { event })
        afterResponseHook(event as unknown as Record<string, unknown>)

        const record = getArchivedSsrRecords()[0]
        expect(record.spans[0]?.status).toBe('error')
        expect(record.spans.some((span) => span.name === 'nitro:error')).toBe(true)
    })

    it('times wrapped middleware as nitro:middleware:<name>', async () => {
        const event = makeEvent()

        requestHook(event as unknown as Record<string, unknown>)
        await middlewareLayer.handler(event as unknown as Record<string, unknown>)
        afterResponseHook(event as unknown as Record<string, unknown>)

        const names = getArchivedSsrRecords()[0].spans.map((span) => span.name)
        expect(names).toContain('nitro:middleware:auth')
    })

    it('returns archived records from the dev timeline endpoint', () => {
        const event = makeEvent()

        requestHook(event as unknown as Record<string, unknown>)
        afterResponseHook(event as unknown as Record<string, unknown>)

        const payload = timelineHandler?.({ method: 'GET', context: {} })
        expect(Array.isArray(payload)).toBe(true)
        expect((payload as { name: string }[]).some((record) => record.name.startsWith('nitro:'))).toBe(true)
    })
})
