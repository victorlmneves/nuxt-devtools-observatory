import { describe, it, expect, beforeEach } from 'vitest'
import { TraceStore } from '@observatory/runtime/tracing/traceStore'
import { mergeSsrTraceRecord, type MergeableSsrRecord } from '@observatory/runtime/tracing/mergeSsrTraceRecord'

function makeRecord(overrides: Partial<MergeableSsrRecord> = {}): MergeableSsrRecord {
    return {
        traceId: 'trace_ssr_1',
        name: 'ssr:/home',
        spans: [
            {
                id: 'span_nav',
                name: 'ssr:navigation',
                type: 'navigation',
                startTime: 0,
                endTime: 40,
                durationMs: 40,
                status: 'ok',
                metadata: { origin: 'ssr' },
            },
            {
                id: 'span_render',
                name: 'ssr:render:html',
                type: 'server',
                startTime: 10,
                endTime: 20,
                durationMs: 10,
                status: 'ok',
            },
        ],
        ...overrides,
    }
}

describe('mergeSsrTraceRecord', () => {
    let store: TraceStore

    beforeEach(() => {
        store = new TraceStore()
    })

    it('creates a trace with origin ssr', () => {
        mergeSsrTraceRecord(makeRecord(), { store, now: 1000 })

        const traces = store.getAllTraces()
        expect(traces).toHaveLength(1)
        expect(traces[0].id).toBe('trace_ssr_1')
        expect(traces[0].name).toBe('ssr:/home')
        expect(traces[0].metadata?.origin).toBe('ssr')
        expect(traces[0].spans).toHaveLength(2)
    })

    it('does not duplicate spans when the same record is merged twice', () => {
        const record = makeRecord()
        mergeSsrTraceRecord(record, { store, now: 1000 })
        mergeSsrTraceRecord(record, { store, now: 2000 })

        expect(store.getAllTraces()).toHaveLength(1)
        expect(store.getTrace('trace_ssr_1')?.spans).toHaveLength(2)
    })

    it('appends new span ids from a later archive snapshot', () => {
        mergeSsrTraceRecord(makeRecord(), { store, now: 1000 })
        mergeSsrTraceRecord(
            makeRecord({
                spans: [
                    ...makeRecord().spans,
                    {
                        id: 'span_handler',
                        name: 'nitro:handler',
                        type: 'server',
                        startTime: 0,
                        endTime: 35,
                        durationMs: 35,
                        status: 'ok',
                    },
                ],
            }),
            { store, now: 1000 }
        )

        const names = store.getTrace('trace_ssr_1')?.spans.map((span) => span.name)
        expect(names).toEqual(['ssr:navigation', 'ssr:render:html', 'nitro:handler'])
    })

    it('returns false for invalid payloads', () => {
        expect(mergeSsrTraceRecord({ traceId: '', name: 'x', spans: [] }, { store })).toBe(false)
        expect(mergeSsrTraceRecord({ traceId: 'a', name: 'x', spans: undefined as unknown as [] }, { store })).toBe(false)
    })
})
