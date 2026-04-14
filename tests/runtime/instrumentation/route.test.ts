import { describe, it, expect, beforeEach } from 'vitest'
import { setupRouteInstrumentation } from '@observatory/runtime/instrumentation/route'
import { traceStore } from '@observatory/runtime/tracing/traceStore'
import type { NuxtApp } from '#app'

const TRACE_CONTEXT_KEY = '__observatory_trace_context__'

// Build a minimal NuxtApp stub that records hook registrations and allows tests
// to trigger them manually.
function createMockApp(currentPath: string = '/home') {
    const hooks: Record<string, Array<() => void>> = {}
    const carrier = {}

    const nuxtApp = {
        hook: (event: string, cb: () => void) => {
            hooks[event] ??= []
            hooks[event].push(cb)
        },
    } as unknown as NuxtApp

    function trigger(event: string) {
        hooks[event]?.forEach((cb) => cb())
    }

    const options = {
        getCurrentPath: () => currentPath,
        carrier,
    }

    return { nuxtApp, trigger, carrier, options }
}

beforeEach(() => {
    traceStore.clear()
    delete (globalThis as Record<string, unknown>)[TRACE_CONTEXT_KEY]
})

describe('setupRouteInstrumentation', () => {
    describe('page:start', () => {
        it('creates a trace named route:<path>', () => {
            const { nuxtApp, trigger, options } = createMockApp('/dashboard')
            setupRouteInstrumentation(nuxtApp, options)
            trigger('page:start')

            const traces = traceStore.getAllTraces()

            expect(traces).toHaveLength(1)
            expect(traces[0].name).toBe('route:/dashboard')
        })

        it('sets kind metadata on the new trace', () => {
            const { nuxtApp, trigger, options } = createMockApp('/shop')
            setupRouteInstrumentation(nuxtApp, options)
            trigger('page:start')

            const trace = traceStore.getAllTraces()[0]

            expect(trace.metadata?.kind).toBe('route-navigation')
            expect(trace.metadata?.route).toBe('/shop')
        })

        it('stores the traceId on the carrier', () => {
            const { nuxtApp, trigger, options, carrier } = createMockApp('/home')
            setupRouteInstrumentation(nuxtApp, options)
            trigger('page:start')

            const traceId = traceStore.getAllTraces()[0].id

            expect((carrier as Record<string, unknown>)[TRACE_CONTEXT_KEY]).toBeDefined()
            expect(
                ((carrier as Record<string, unknown>)[TRACE_CONTEXT_KEY] as { currentTraceId?: string })?.currentTraceId,
            ).toBe(traceId)
        })

        it('cancels the previous trace when a new navigation starts', () => {
            const { nuxtApp, trigger, options } = createMockApp('/home')
            setupRouteInstrumentation(nuxtApp, options)
            trigger('page:start')

            const firstTraceId = traceStore.getAllTraces()[0].id

            trigger('page:start')

            const firstTrace = traceStore.getTrace(firstTraceId)

            expect(firstTrace?.status).toBe('cancelled')
            expect(firstTrace?.endTime).toBeDefined()
            expect(traceStore.getAllTraces()).toHaveLength(2)
        })
    })

    describe('page:finish', () => {
        it('ends the active trace with status ok', () => {
            const { nuxtApp, trigger, options } = createMockApp('/home')
            setupRouteInstrumentation(nuxtApp, options)
            trigger('page:start')
            trigger('page:finish')

            const trace = traceStore.getAllTraces()[0]

            expect(trace.status).toBe('ok')
            expect(trace.endTime).toBeDefined()
        })

        it('clears the currentTraceId from the carrier', () => {
            const { nuxtApp, trigger, options, carrier } = createMockApp('/home')
            setupRouteInstrumentation(nuxtApp, options)
            trigger('page:start')
            trigger('page:finish')

            const ctx = (carrier as Record<string, unknown>)[TRACE_CONTEXT_KEY] as
                | { currentTraceId?: string }
                | undefined

            expect(ctx?.currentTraceId).toBeUndefined()
        })

        it('is a no-op when called without a prior page:start', () => {
            const { nuxtApp, trigger, options } = createMockApp('/home')
            setupRouteInstrumentation(nuxtApp, options)

            expect(() => trigger('page:finish')).not.toThrow()
            expect(traceStore.getAllTraces()).toHaveLength(0)
        })
    })

    describe('getCurrentPath fallback', () => {
        it('falls back to "/" when the path is an empty string', () => {
            const { nuxtApp, trigger, options } = createMockApp('')
            setupRouteInstrumentation(nuxtApp, options)
            trigger('page:start')

            expect(traceStore.getAllTraces()[0].name).toBe('route:/')
        })
    })

    describe('full navigation lifecycle', () => {
        it('start → finish creates a completed trace', () => {
            const { nuxtApp, trigger, options } = createMockApp('/about')
            setupRouteInstrumentation(nuxtApp, options)
            trigger('page:start')
            trigger('page:finish')

            const traces = traceStore.getAllTraces()

            expect(traces).toHaveLength(1)
            expect(traces[0].status).toBe('ok')
        })

        it('two consecutive navigations each get their own completed trace', () => {
            const { nuxtApp, trigger, options } = createMockApp('/page-a')
            setupRouteInstrumentation(nuxtApp, options)
            trigger('page:start')
            trigger('page:finish')
            trigger('page:start')
            trigger('page:finish')

            const traces = traceStore.getAllTraces()
            
            expect(traces).toHaveLength(2)
            expect(traces.every((t) => t.status === 'ok')).toBe(true)
        })
    })
})
