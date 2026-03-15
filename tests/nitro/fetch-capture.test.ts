import { describe, it, expect, beforeAll } from 'vitest'

let requestHook: (event: Record<string, unknown>) => void
let afterResponseHook: (event: Record<string, unknown>, response: { headers?: { set: (k: string, v: string) => void } } | null) => void

// defineNitroPlugin must be on globalThis before the module is imported,
// so we use a dynamic import inside beforeAll.
beforeAll(async () => {
    ;(globalThis as Record<string, unknown>).defineNitroPlugin = (
        fn: (app: { hooks: { hook: (name: string, handler: unknown) => void } }) => void
    ) => {
        fn({
            hooks: {
                hook(name: string, handler: unknown) {
                    if (name === 'request') requestHook = handler as typeof requestHook
                    if (name === 'afterResponse') afterResponseHook = handler as typeof afterResponseHook
                },
            },
        })
    }

    await import('../../src/nitro/fetch-capture')
})

describe('fetch-capture nitro plugin', () => {
    it('stamps event.__ssrFetchStart with a numeric timestamp on request', () => {
        const event: Record<string, unknown> = {}

        requestHook(event)

        expect(typeof event.__ssrFetchStart).toBe('number')
        expect(event.__ssrFetchStart as number).toBeGreaterThan(0)
    })

    it('sets the x-observatory-ssr-ms response header after a response', () => {
        const headers = new Map<string, string>()
        const event: Record<string, unknown> = { __ssrFetchStart: performance.now() - 50 }
        const response = { headers: { set: (k: string, v: string) => headers.set(k, v) } }

        afterResponseHook(event, response)

        expect(headers.has('x-observatory-ssr-ms')).toBe(true)
        expect(Number(headers.get('x-observatory-ssr-ms'))).toBeGreaterThanOrEqual(0)
    })

    it('the elapsed ms in the header is a non-negative integer', () => {
        const headers = new Map<string, string>()
        const event: Record<string, unknown> = { __ssrFetchStart: performance.now() - 100 }
        const response = { headers: { set: (k: string, v: string) => headers.set(k, v) } }

        afterResponseHook(event, response)

        const ms = Number(headers.get('x-observatory-ssr-ms'))

        expect(Number.isInteger(ms)).toBe(true)
        expect(ms).toBeGreaterThanOrEqual(0)
    })

    it('does NOT set the header when the event has no __ssrFetchStart', () => {
        const headers = new Map<string, string>()
        const event: Record<string, unknown> = {}
        const response = { headers: { set: (k: string, v: string) => headers.set(k, v) } }

        afterResponseHook(event, response)

        expect(headers.has('x-observatory-ssr-ms')).toBe(false)
    })

    it('does NOT throw when response is null', () => {
        const event: Record<string, unknown> = { __ssrFetchStart: performance.now() }

        expect(() => afterResponseHook(event, null)).not.toThrow()
    })
})
