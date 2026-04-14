import { describe, it, expect, beforeEach } from 'vitest'
import { TraceStore } from '@observatory/runtime/tracing/traceStore'

describe('TraceStore', () => {
    let store: TraceStore

    beforeEach(() => {
        store = new TraceStore()
    })

    describe('createTrace', () => {
        it('creates a trace with default values', () => {
            const trace = store.createTrace()

            expect(trace.id).toMatch(/^trace_/)
            expect(trace.name).toBe('trace')
            expect(trace.status).toBe('active')
            expect(trace.spans).toEqual([])
            expect(typeof trace.startTime).toBe('number')
        })

        it('accepts custom id, name, startTime, and metadata', () => {
            const trace = store.createTrace({
                id: 'my-trace',
                name: 'route:/home',
                startTime: 1000,
                metadata: { kind: 'navigation' },
            })

            expect(trace.id).toBe('my-trace')
            expect(trace.name).toBe('route:/home')
            expect(trace.startTime).toBe(1000)
            expect(trace.metadata).toEqual({ kind: 'navigation' })
        })

        it('stores the trace so it can be retrieved by getTrace', () => {
            const trace = store.createTrace({ id: 'abc' })

            expect(store.getTrace('abc')).toBe(trace)
        })

        it('does not set endTime or durationMs on a new trace', () => {
            const trace = store.createTrace()

            expect(trace.endTime).toBeUndefined()
            expect(trace.durationMs).toBeUndefined()
        })
    })

    describe('addSpan', () => {
        it('appends a span to an existing trace', () => {
            const trace = store.createTrace({ id: 'trace-1' })
            const span = store.addSpan({ traceId: 'trace-1', name: 'my-span', type: 'custom' })

            expect(trace.spans).toHaveLength(1)
            expect(span.name).toBe('my-span')
            expect(span.type).toBe('custom')
            expect(span.status).toBe('active')
            expect(span.traceId).toBe('trace-1')
        })

        it('auto-creates a trace for an unknown traceId via ensureTrace', () => {
            const span = store.addSpan({ traceId: 'auto-created', name: 'late-span', type: 'fetch' })
            const trace = store.getTrace('auto-created')

            expect(trace).toBeDefined()
            expect(trace?.spans).toHaveLength(1)
            expect(span.traceId).toBe('auto-created')
        })

        it('sets durationMs and status ok when endTime is provided', () => {
            store.createTrace({ id: 'trace-1', startTime: 0 })
            const span = store.addSpan({
                traceId: 'trace-1',
                name: 'finished',
                type: 'custom',
                startTime: 100,
                endTime: 200,
            })

            expect(span.durationMs).toBe(100)
            expect(span.status).toBe('ok')
            expect(span.endTime).toBe(200)
        })

        it('uses provided status over the endTime default', () => {
            store.createTrace({ id: 'trace-1' })
            const span = store.addSpan({
                traceId: 'trace-1',
                name: 'err',
                type: 'fetch',
                startTime: 0,
                endTime: 50,
                status: 'error',
            })

            expect(span.status).toBe('error')
        })

        it('preserves parentSpanId and metadata on the span', () => {
            store.createTrace({ id: 'trace-1' })
            const span = store.addSpan({
                traceId: 'trace-1',
                name: 'child',
                type: 'component',
                parentSpanId: 'parent-span',
                metadata: { route: '/home' },
            })

            expect(span.parentSpanId).toBe('parent-span')
            expect(span.metadata).toEqual({ route: '/home' })
        })
    })

    describe('endTrace', () => {
        it('sets endTime, durationMs, and status', () => {
            store.createTrace({ id: 'trace-1', startTime: 0 })
            const result = store.endTrace('trace-1', { endTime: 500, status: 'ok' })

            expect(result?.endTime).toBe(500)
            expect(result?.durationMs).toBe(500)
            expect(result?.status).toBe('ok')
        })

        it('defaults status to ok when not specified', () => {
            store.createTrace({ id: 'trace-1' })
            store.endTrace('trace-1')

            expect(store.getTrace('trace-1')?.status).toBe('ok')
        })

        it('merges metadata with existing trace metadata', () => {
            store.createTrace({ id: 'trace-1', metadata: { initial: true } })
            store.endTrace('trace-1', { metadata: { extra: 42 } })

            expect(store.getTrace('trace-1')?.metadata).toMatchObject({ initial: true, extra: 42 })
        })

        it('sets metadata when the trace had none', () => {
            store.createTrace({ id: 'trace-1' })
            store.endTrace('trace-1', { metadata: { route: '/home' } })

            expect(store.getTrace('trace-1')?.metadata).toEqual({ route: '/home' })
        })

        it('returns null for an unknown traceId', () => {
            expect(store.endTrace('not-found')).toBeNull()
        })

        it('can mark a trace as cancelled', () => {
            store.createTrace({ id: 'trace-1' })
            store.endTrace('trace-1', { status: 'cancelled' })

            expect(store.getTrace('trace-1')?.status).toBe('cancelled')
        })
    })

    describe('endSpan', () => {
        it('updates span endTime, durationMs, and status', () => {
            store.createTrace({ id: 'trace-1', startTime: 0 })
            const span = store.addSpan({ traceId: 'trace-1', name: 'sp', type: 'custom', startTime: 10 })
            const result = store.endSpan(span.id, 'trace-1', { endTime: 60, status: 'ok' })

            expect(result?.endTime).toBe(60)
            expect(result?.durationMs).toBe(50)
            expect(result?.status).toBe('ok')
        })

        it('defaults status to ok when not specified', () => {
            store.createTrace({ id: 'trace-1' })
            const span = store.addSpan({ traceId: 'trace-1', name: 'sp', type: 'custom' })
            store.endSpan(span.id, 'trace-1')

            expect(store.getTrace('trace-1')?.spans[0].status).toBe('ok')
        })

        it('merges metadata onto the span', () => {
            store.createTrace({ id: 'trace-1' })
            const span = store.addSpan({ traceId: 'trace-1', name: 'sp', type: 'custom', metadata: { base: 1 } })
            store.endSpan(span.id, 'trace-1', { metadata: { added: 2 } })

            expect(store.getTrace('trace-1')?.spans[0].metadata).toMatchObject({ base: 1, added: 2 })
        })

        it('returns null for an unknown traceId', () => {
            expect(store.endSpan('span-x', 'no-trace')).toBeNull()
        })

        it('returns null for an unknown spanId', () => {
            store.createTrace({ id: 'trace-1' })

            expect(store.endSpan('no-span', 'trace-1')).toBeNull()
        })
    })

    describe('getAllTraces / getTrace / clear', () => {
        it('getAllTraces returns all stored traces', () => {
            store.createTrace({ id: 'a' })
            store.createTrace({ id: 'b' })

            expect(store.getAllTraces()).toHaveLength(2)
        })

        it('getAllTraces returns a snapshot array (not the internal map)', () => {
            store.createTrace({ id: 'a' })
            const before = store.getAllTraces()
            store.createTrace({ id: 'b' })

            expect(before).toHaveLength(1)
            expect(store.getAllTraces()).toHaveLength(2)
        })

        it('getTrace returns undefined for an unknown id', () => {
            expect(store.getTrace('missing')).toBeUndefined()
        })

        it('clear removes all traces', () => {
            store.createTrace({ id: 'a' })
            store.createTrace({ id: 'b' })
            store.clear()

            expect(store.getAllTraces()).toHaveLength(0)
        })
    })

    describe('computeDuration edge case', () => {
        it('durationMs is 0 when endTime is before startTime', () => {
            store.createTrace({ id: 'trace-1', startTime: 1000 })
            const span = store.addSpan({
                traceId: 'trace-1',
                name: 'odd',
                type: 'custom',
                startTime: 500,
                endTime: 100,
            })

            expect(span.durationMs).toBe(0)
        })

        it('endTrace durationMs is 0 when endTime is before startTime', () => {
            store.createTrace({ id: 'trace-1', startTime: 1000 })
            const result = store.endTrace('trace-1', { endTime: 500 })

            expect(result?.durationMs).toBe(0)
        })
    })
})
