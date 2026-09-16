// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupFetchInstrumentation } from '@observatory/runtime/instrumentation/fetch'
import {
    OBSERVATORY_FETCH_TRACKED,
    beginNestedFetchSuppress,
    endNestedFetchSuppress,
} from '@observatory/runtime/instrumentation/fetch-dedup'
import { setupFetchRegistry } from '@observatory/runtime/composables/fetch-registry'
import { traceStore } from '@observatory/runtime/tracing/traceStore'
import type { NuxtApp } from '#app'

const TRACE_CONTEXT_KEY = '__observatory_trace_context__'
const WRAPPED_FLAG = '__observatory_wrapped_fetch__'

function makeNuxtApp(fetchImpl?: ((...args: unknown[]) => Promise<unknown>) & { raw?: unknown; create?: unknown }) {
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

    describe('fetch dashboard registry', () => {
        it('registers pending then ok for a direct $fetch call', async () => {
            const registry = setupFetchRegistry()
            const nuxtApp = makeNuxtApp(vi.fn().mockResolvedValue({ id: 1 }))
            setupFetchInstrumentation(nuxtApp, registry)

            await (nuxtApp.$fetch as unknown as (...a: unknown[]) => Promise<unknown>)('/api/stats', { method: 'get' })

            const entries = registry.getAll()
            expect(entries).toHaveLength(1)
            expect(entries[0].url).toBe('/api/stats')
            expect(entries[0].method).toBe('GET')
            expect(entries[0].source).toBe('$fetch')
            expect(entries[0].status).toBe('ok')
            expect(entries[0].payload).toEqual({ id: 1 })
        })

        it('wraps $fetch.raw onto the same dashboard', async () => {
            const raw = vi.fn().mockResolvedValue({ _data: { via: 'raw' } })
            const original = Object.assign(vi.fn().mockResolvedValue({}), { raw })
            const registry = setupFetchRegistry()
            const nuxtApp = makeNuxtApp(original)
            setupFetchInstrumentation(nuxtApp, registry)

            await (nuxtApp.$fetch as unknown as { raw: (...a: unknown[]) => Promise<unknown> }).raw('/api/raw')

            const entries = registry.getAll()
            expect(entries).toHaveLength(1)
            expect(entries[0].source).toBe('$fetch.raw')
            expect(entries[0].payload).toEqual({ via: 'raw' })
            expect(raw).toHaveBeenCalled()
        })

        it('wraps instances returned by $fetch.create', async () => {
            const child = vi.fn().mockResolvedValue({ created: true })
            const original = Object.assign(vi.fn().mockResolvedValue({}), {
                create: vi.fn(() => child),
            })
            const registry = setupFetchRegistry()
            const nuxtApp = makeNuxtApp(original)
            setupFetchInstrumentation(nuxtApp, registry)

            const api = (nuxtApp.$fetch as unknown as { create: () => (...a: unknown[]) => Promise<unknown> }).create()
            await api('/api/from-create')

            const entries = registry.getAll()
            expect(entries).toHaveLength(1)
            expect(entries[0].url).toBe('/api/from-create')
            expect(entries[0].source).toBe('$fetch')
            expect(child).toHaveBeenCalled()
        })

        it('does not add a dashboard row for useFetch-tagged options', async () => {
            const registry = setupFetchRegistry()
            const nuxtApp = makeNuxtApp(vi.fn().mockResolvedValue({}))
            setupFetchInstrumentation(nuxtApp, registry)

            await (nuxtApp.$fetch as unknown as (...a: unknown[]) => Promise<unknown>)('/api/users', {
                [OBSERVATORY_FETCH_TRACKED]: true,
            })

            expect(registry.getAll()).toHaveLength(0)
            expect(getSpans()).toHaveLength(1)
        })

        it('does not add a dashboard row while nested useAsyncData suppress is active', async () => {
            const registry = setupFetchRegistry()
            const nuxtApp = makeNuxtApp(vi.fn().mockResolvedValue({}))
            setupFetchInstrumentation(nuxtApp, registry)

            beginNestedFetchSuppress()
            try {
                await (nuxtApp.$fetch as unknown as (...a: unknown[]) => Promise<unknown>)('/api/nested')
            } finally {
                endNestedFetchSuppress()
            }

            expect(registry.getAll()).toHaveLength(0)
            expect(getSpans()).toHaveLength(1)
        })
    })
})
