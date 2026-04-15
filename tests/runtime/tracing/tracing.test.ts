import { describe, it, expect, beforeEach } from 'vitest'
import { startSpan } from '@observatory/runtime/tracing/tracing'
import { TraceStore } from '@observatory/runtime/tracing/traceStore'

const TRACE_CONTEXT_KEY = '__observatory_trace_context__'
interface Carrier {
    [TRACE_CONTEXT_KEY]?: { currentTraceId?: string }
}

function makeContext() {
    const store = new TraceStore()
    const carrier: Carrier = {}

    return { store, carrier }
}

describe('startSpan', () => {
    it('creates a new trace when no active traceId exists', () => {
        const { store, carrier } = makeContext()
        const handle = startSpan({ name: 'my-span', type: 'custom' }, { store, carrier })

        expect(handle.trace).toBeDefined()
        expect(handle.span.name).toBe('my-span')
        expect(store.getAllTraces()).toHaveLength(1)
    })

    it('sets the currentTraceId on the carrier after the first call', () => {
        const { store, carrier } = makeContext()
        const handle = startSpan({ name: 'span1', type: 'custom' }, { store, carrier })

        expect(carrier[TRACE_CONTEXT_KEY]?.currentTraceId).toBe(handle.trace.id)
    })

    it('reuses the existing trace when carrier already has a currentTraceId', () => {
        const { store, carrier } = makeContext()
        const handle1 = startSpan({ name: 'span1', type: 'custom' }, { store, carrier })
        const handle2 = startSpan({ name: 'span2', type: 'custom' }, { store, carrier })

        expect(handle1.trace.id).toBe(handle2.trace.id)
        expect(store.getAllTraces()).toHaveLength(1)
        expect(store.getAllTraces()[0].spans).toHaveLength(2)
    })

    it('creates a separate trace when a fresh carrier is provided', () => {
        const store = new TraceStore()
        const carrier1: Carrier = {}
        const carrier2: Carrier = {}
        startSpan({ name: 'span1', type: 'custom' }, { store, carrier: carrier1 })
        startSpan({ name: 'span2', type: 'custom' }, { store, carrier: carrier2 })

        expect(store.getAllTraces()).toHaveLength(2)
    })

    it('end() transitions span status from active to ok', () => {
        const { store, carrier } = makeContext()
        const handle = startSpan({ name: 'span1', type: 'custom' }, { store, carrier })

        expect(handle.span.status).toBe('active')

        handle.end({ status: 'ok' })

        expect(handle.span.status).toBe('ok')
        expect(handle.span.endTime).toBeDefined()
        expect(handle.span.durationMs).toBeDefined()
    })

    it('end() is idempotent — second call does not overwrite the first', () => {
        const { store, carrier } = makeContext()
        const handle = startSpan({ name: 'span1', type: 'custom' }, { store, carrier })
        handle.end({ status: 'ok' })
        const firstEndTime = handle.span.endTime

        // Second call should be a no-op
        handle.end({ status: 'error' })

        expect(handle.span.endTime).toBe(firstEndTime)
        expect(handle.span.status).toBe('ok')
    })

    it('end() merges metadata from startSpan and end call', () => {
        const { store, carrier } = makeContext()
        const handle = startSpan({ name: 'span1', type: 'custom', metadata: { initial: 1 } }, { store, carrier })
        handle.end({ status: 'ok', metadata: { extra: 2 } })

        expect(handle.span.metadata).toMatchObject({ initial: 1, extra: 2 })
    })

    it('end() with error status records the error', () => {
        const { store, carrier } = makeContext()
        const handle = startSpan({ name: 'fetch-span', type: 'fetch' }, { store, carrier })
        handle.end({ status: 'error', metadata: { statusCode: 500 } })

        expect(handle.span.status).toBe('error')
        expect(handle.span.metadata).toMatchObject({ statusCode: 500 })
    })

    it('uses traceName when creating a new trace', () => {
        const { store, carrier } = makeContext()
        const handle = startSpan({ name: 'nav-span', type: 'navigation' }, { store, carrier, traceName: 'route:/home' })

        expect(handle.trace.name).toBe('route:/home')
    })

    it('uses traceMetadata when creating a new trace', () => {
        const { store, carrier } = makeContext()
        const handle = startSpan({ name: 'span', type: 'custom' }, { store, carrier, traceMetadata: { kind: 'route-navigation' } })

        expect(handle.trace.metadata).toMatchObject({ kind: 'route-navigation' })
    })

    it('uses a custom startTime when provided', () => {
        const { store, carrier } = makeContext()
        const handle = startSpan({ name: 'timed', type: 'render', startTime: 100 }, { store, carrier })

        expect(handle.span.startTime).toBe(100)
    })

    describe('with traceId provided directly on input', () => {
        it('creates a new trace using the provided traceId if it does not exist', () => {
            const { store, carrier } = makeContext()
            const handle = startSpan({ name: 'span1', type: 'custom', traceId: 'explicit-id' }, { store, carrier })

            expect(handle.trace.id).toBe('explicit-id')
            expect(store.getTrace('explicit-id')).toBeDefined()
        })

        it('reuses an existing trace when a matching traceId exists in the store', () => {
            const { store, carrier } = makeContext()
            store.createTrace({ id: 'existing-trace' })
            const handle = startSpan({ name: 'span1', type: 'custom', traceId: 'existing-trace' }, { store, carrier })

            expect(handle.trace.id).toBe('existing-trace')
            expect(store.getAllTraces()).toHaveLength(1)
        })
    })
})
