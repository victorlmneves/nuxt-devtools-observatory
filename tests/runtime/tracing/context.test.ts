import { describe, it, expect, afterEach } from 'vitest'
import { setCurrentTraceId, getCurrentTraceId } from '@observatory/runtime/tracing/context'

const TRACE_CONTEXT_KEY = '__observatory_trace_context__'

interface Carrier {
    [TRACE_CONTEXT_KEY]?: { currentTraceId?: string }
}

afterEach(() => {
    // Prevent globalThis pollution across tests
    delete (globalThis as Record<string, unknown>)[TRACE_CONTEXT_KEY]
})

describe('setCurrentTraceId / getCurrentTraceId', () => {
    it('stores and retrieves a traceId on globalThis by default', () => {
        setCurrentTraceId('trace-abc')

        expect(getCurrentTraceId()).toBe('trace-abc')
    })

    it('returns undefined when no traceId has been set', () => {
        const carrier: Carrier = {}

        expect(getCurrentTraceId(carrier)).toBeUndefined()
    })

    it('uses a custom carrier independently of globalThis', () => {
        const carrier: Carrier = {}
        setCurrentTraceId('carrier-trace', carrier)

        expect(getCurrentTraceId(carrier)).toBe('carrier-trace')
        expect(getCurrentTraceId()).toBeUndefined()
    })

    it('two separate carriers do not interfere with each other', () => {
        const carrier1: Carrier = {}
        const carrier2: Carrier = {}
        setCurrentTraceId('trace-1', carrier1)
        setCurrentTraceId('trace-2', carrier2)

        expect(getCurrentTraceId(carrier1)).toBe('trace-1')
        expect(getCurrentTraceId(carrier2)).toBe('trace-2')
    })

    it('setting undefined clears the stored traceId', () => {
        const carrier: Carrier = {}
        setCurrentTraceId('temp', carrier)
        setCurrentTraceId(undefined, carrier)

        expect(getCurrentTraceId(carrier)).toBeUndefined()
    })

    it('initializes the context object lazily on first set', () => {
        const carrier: Carrier = {}

        expect(carrier[TRACE_CONTEXT_KEY]).toBeUndefined()

        setCurrentTraceId('lazy', carrier)

        expect(carrier[TRACE_CONTEXT_KEY]).toBeDefined()
    })

    it('overwrites a previously stored traceId', () => {
        const carrier: Carrier = {}
        setCurrentTraceId('first', carrier)
        setCurrentTraceId('second', carrier)

        expect(getCurrentTraceId(carrier)).toBe('second')
    })
})
