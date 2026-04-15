import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupFetchInstrumentation } from '@observatory/runtime/instrumentation/fetch'
import { traceStore } from '@observatory/runtime/tracing/traceStore'
import type { NuxtApp } from '#app'

const TRACE_CONTEXT_KEY = '__observatory_trace_context__'
const WRAPPED_FLAG = '__observatory_wrapped_fetch__'

function makeNuxtApp(fetchImpl?: (...args: unknown[]) => Promise<unknown>) {
    return {
        $fetch: fetchImpl ?? vi.fn().mockResolvedValue({}),
    } as unknown as NuxtApp
}

beforeEach(() => {
    traceStore.clear()
    delete (globalThis as Record<string, unknown>)[TRACE_CONTEXT_KEY]
})

function getSpans() {
    return traceStore.getAllTraces().flatMap((t) => t.spans)
}

describe('setupFetchInstrumentation', () => {
    describe('span creation on successful fetch', () => {
        it('creates a fetch span with status ok after resolution', async () => {
            const nuxtApp = makeNuxtApp(vi.fn().mockResolvedValue({ ok: true }))
            setupFetchInstrumentation(nuxtApp)

            await (nuxtApp.$fetch as unknown as (...a: unknown[]) => Promise<unknown>)('/api/users')

            const spans = getSpans()

            expect(spans).toHaveLength(1)
            expect(spans[0].status).toBe('ok')
            expect(spans[0].type).toBe('fetch')
        })

        it('records the span name as $fetch', async () => {
            const nuxtApp = makeNuxtApp(vi.fn().mockResolvedValue({}))
            setupFetchInstrumentation(nuxtApp)
            await (nuxtApp.$fetch as unknown as (...a: unknown[]) => Promise<unknown>)('/api/test')

            expect(getSpans()[0].name).toBe('$fetch')
        })

        it('returns the resolved value unchanged', async () => {
            const payload = { id: 1, name: 'Alice' }
            const nuxtApp = makeNuxtApp(vi.fn().mockResolvedValue(payload))
            setupFetchInstrumentation(nuxtApp)

            const result = await (nuxtApp.$fetch as unknown as (...a: unknown[]) => Promise<unknown>)('/api/user')

            expect(result).toEqual(payload)
        })
    })

    describe('span creation on failed fetch', () => {
        it('ends span with error status when the original fetch rejects', async () => {
            const error = new Error('Network Error')
            const nuxtApp = makeNuxtApp(vi.fn().mockRejectedValue(error))
            setupFetchInstrumentation(nuxtApp)

            await expect((nuxtApp.$fetch as unknown as (...a: unknown[]) => Promise<unknown>)('/api/fail')).rejects.toThrow('Network Error')

            const spans = getSpans()

            expect(spans[0].status).toBe('error')
        })

        it('records response.status as statusCode in span metadata', async () => {
            const error = { response: { status: 404 } }
            const nuxtApp = makeNuxtApp(vi.fn().mockRejectedValue(error))
            setupFetchInstrumentation(nuxtApp)

            await expect((nuxtApp.$fetch as unknown as (...a: unknown[]) => Promise<unknown>)('/api/missing')).rejects.toBeDefined()

            expect(getSpans()[0].metadata?.statusCode).toBe(404)
        })

        it('records statusCode field from error object', async () => {
            const error = { statusCode: 500 }
            const nuxtApp = makeNuxtApp(vi.fn().mockRejectedValue(error))
            setupFetchInstrumentation(nuxtApp)

            await expect((nuxtApp.$fetch as unknown as (...a: unknown[]) => Promise<unknown>)('/api/crash')).rejects.toBeDefined()

            expect(getSpans()[0].metadata?.statusCode).toBe(500)
        })

        it('records status field from error object', async () => {
            const error = { status: 403 }
            const nuxtApp = makeNuxtApp(vi.fn().mockRejectedValue(error))
            setupFetchInstrumentation(nuxtApp)

            await expect((nuxtApp.$fetch as unknown as (...a: unknown[]) => Promise<unknown>)('/api/forbidden')).rejects.toBeDefined()

            expect(getSpans()[0].metadata?.statusCode).toBe(403)
        })

        it('re-throws the original error after ending the span', async () => {
            const originalError = new Error('original')
            const nuxtApp = makeNuxtApp(vi.fn().mockRejectedValue(originalError))
            setupFetchInstrumentation(nuxtApp)

            await expect((nuxtApp.$fetch as unknown as (...a: unknown[]) => Promise<unknown>)('/api/err')).rejects.toBe(originalError)
        })
    })

    describe('URL resolution (resolveUrl)', () => {
        async function callWith(input: unknown, nuxtApp: NuxtApp) {
            await (nuxtApp.$fetch as unknown as (...a: unknown[]) => Promise<unknown>)(input)
        }

        it('records a plain string URL', async () => {
            const nuxtApp = makeNuxtApp(vi.fn().mockResolvedValue({}))
            setupFetchInstrumentation(nuxtApp)
            await callWith('/api/items', nuxtApp)

            expect(getSpans()[0].metadata?.url).toBe('/api/items')
        })

        it('extracts url from a Request-like object', async () => {
            const nuxtApp = makeNuxtApp(vi.fn().mockResolvedValue({}))
            setupFetchInstrumentation(nuxtApp)
            await callWith({ url: '/api/resource' }, nuxtApp)

            expect(getSpans()[0].metadata?.url).toBe('/api/resource')
        })

        it('converts null/undefined input to an empty string URL', async () => {
            const nuxtApp = makeNuxtApp(vi.fn().mockResolvedValue({}))
            setupFetchInstrumentation(nuxtApp)
            await callWith(null, nuxtApp)

            expect(getSpans()[0].metadata?.url).toBe('')
        })
    })

    describe('method resolution (resolveMethod)', () => {
        async function callWith(input: unknown, options: Record<string, unknown>, nuxtApp: NuxtApp) {
            await (nuxtApp.$fetch as unknown as (...a: unknown[]) => Promise<unknown>)(input, options)
        }

        it('uses method from options and uppercases it', async () => {
            const nuxtApp = makeNuxtApp(vi.fn().mockResolvedValue({}))
            setupFetchInstrumentation(nuxtApp)
            await callWith('/api/data', { method: 'post' }, nuxtApp)

            expect(getSpans()[0].metadata?.method).toBe('POST')
        })

        it('falls back to GET when no method is provided', async () => {
            const nuxtApp = makeNuxtApp(vi.fn().mockResolvedValue({}))
            setupFetchInstrumentation(nuxtApp)
            await callWith('/api/data', {}, nuxtApp)

            expect(getSpans()[0].metadata?.method).toBe('GET')
        })

        it('reads method from a Request-like first argument', async () => {
            const nuxtApp = makeNuxtApp(vi.fn().mockResolvedValue({}))
            setupFetchInstrumentation(nuxtApp)
            await callWith({ url: '/api/x', method: 'DELETE' }, {}, nuxtApp)

            expect(getSpans()[0].metadata?.method).toBe('DELETE')
        })
    })

    describe('double-wrap protection', () => {
        it('does not re-wrap an already-wrapped $fetch', () => {
            const original = vi.fn().mockResolvedValue({})
            const nuxtApp = makeNuxtApp(original)
            setupFetchInstrumentation(nuxtApp)

            const wrappedOnce = nuxtApp.$fetch

            setupFetchInstrumentation(nuxtApp)

            // The reference should not change on the second call
            expect(nuxtApp.$fetch).toBe(wrappedOnce)
        })

        it('marks the wrapped function with the sentinel flag', () => {
            const nuxtApp = makeNuxtApp(vi.fn().mockResolvedValue({}))
            setupFetchInstrumentation(nuxtApp)

            expect((nuxtApp.$fetch as unknown as Record<string, unknown>)[WRAPPED_FLAG]).toBe(true)
        })
    })

    describe('guard against missing $fetch', () => {
        it('is a no-op when nuxtApp.$fetch is undefined', () => {
            const nuxtApp = { $fetch: undefined } as unknown as NuxtApp

            expect(() => setupFetchInstrumentation(nuxtApp)).not.toThrow()
            expect(getSpans()).toHaveLength(0)
        })
    })
})
