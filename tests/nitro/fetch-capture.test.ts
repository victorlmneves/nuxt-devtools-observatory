import { describe, it, expect, beforeAll, vi } from 'vitest'

let requestHook: (event: Record<string, unknown>) => void
let afterResponseHook: (event: Record<string, unknown>) => void
const setResponseHeader = vi.fn()

vi.mock('h3', () => ({
    setResponseHeader,
}))

beforeAll(async () => {
    const mod = await import('../../src/runtime/nitro/fetch-capture')

    mod.default({
        hooks: {
            hook(name: string, handler: unknown) {
                if (name === 'request') requestHook = handler as typeof requestHook
                if (name === 'afterResponse') afterResponseHook = handler as typeof afterResponseHook
            },
        },
    })
})

describe('fetch-capture nitro plugin', () => {
    it('stamps event.__ssrFetchStart with a numeric timestamp on request', () => {
        const event: Record<string, unknown> = {}

        requestHook(event)

        expect(typeof event.__ssrFetchStart).toBe('number')
        expect(event.__ssrFetchStart as number).toBeGreaterThan(0)
    })

    it('sets the x-observatory-ssr-ms response header after a response', () => {
        const event: Record<string, unknown> = { __ssrFetchStart: performance.now() - 50 }

        afterResponseHook(event)

        expect(setResponseHeader).toHaveBeenCalledWith(event, 'x-observatory-ssr-ms', expect.any(String))
        expect(Number(setResponseHeader.mock.calls[0][2])).toBeGreaterThanOrEqual(0)
    })

    it('the elapsed ms in the header is a non-negative integer', () => {
        const event: Record<string, unknown> = { __ssrFetchStart: performance.now() - 100 }

        afterResponseHook(event)

        const ms = Number(setResponseHeader.mock.calls.at(-1)?.[2])

        expect(Number.isInteger(ms)).toBe(true)
        expect(ms).toBeGreaterThanOrEqual(0)
    })

    it('does NOT set the header when the event has no __ssrFetchStart', () => {
        const event: Record<string, unknown> = {}

        const callsBefore = setResponseHeader.mock.calls.length
        afterResponseHook(event)

        expect(setResponseHeader.mock.calls).toHaveLength(callsBefore)
    })
})
