import { describe, it, expect, beforeAll, vi } from 'vitest'

let requestHook: (event: Record<string, unknown>) => void
let afterResponseHook: (event: Record<string, unknown>) => void
let renderHtmlHook: (html: { bodyAppend: string[] }, ctx: { event: Record<string, unknown> }) => void

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
                if (name === 'render:html') renderHtmlHook = handler as typeof renderHtmlHook
            },
        },
    })
})

function makeEvent(): { context: Record<string, unknown>; node?: { req?: { method?: string } } } {
    return { context: {} }
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
})
