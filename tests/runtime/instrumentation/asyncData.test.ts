import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTracedAsyncData } from '@observatory/runtime/instrumentation/asyncData'
import { traceStore } from '@observatory/runtime/tracing/traceStore'

const TRACE_CONTEXT_KEY = '__observatory_trace_context__'

const BASE_META = {
    key: 'test-key',
    file: '/src/pages/index.vue',
    line: 10,
    originalFn: 'useFetch',
}

beforeEach(() => {
    traceStore.clear()
    delete (globalThis as Record<string, unknown>)[TRACE_CONTEXT_KEY]
})

function getSpans() {
    return traceStore.getAllTraces().flatMap((t) => t.spans)
}

describe('useTracedAsyncData', () => {
    describe('getNormalizedKey (tested indirectly via span metadata)', () => {
        it('uses the string key as span metadata.key when it is non-empty', async () => {
            const handler = vi.fn().mockResolvedValue('data')
            const originalFn = vi.fn().mockImplementation((_key, wrappedHandler) => wrappedHandler())

            await useTracedAsyncData(originalFn, ['users', handler], 1, 'users', BASE_META)

            expect(getSpans()[0].metadata?.key).toBe('users')
        })

        it('falls back to "useAsyncData" when the key is not a string', async () => {
            const handler = vi.fn().mockResolvedValue('data')
            const originalFn = vi.fn().mockImplementation((_key, wrappedHandler) => wrappedHandler())

            await useTracedAsyncData(originalFn, [42, handler], 1, 42, BASE_META)

            expect(getSpans()[0].metadata?.key).toBe('useAsyncData')
        })

        it('falls back to "useAsyncData" when the key is an empty string', async () => {
            const handler = vi.fn().mockResolvedValue('data')
            const originalFn = vi.fn().mockImplementation((_key, wrappedHandler) => wrappedHandler())

            await useTracedAsyncData(originalFn, ['', handler], 1, '', BASE_META)

            expect(getSpans()[0].metadata?.key).toBe('useAsyncData')
        })
    })

    describe('handler wrapping on success', () => {
        it('creates a fetch span when the handler is invoked', async () => {
            const handler = vi.fn().mockResolvedValue({ users: [] })
            const originalFn = vi.fn().mockImplementation((_key, wrappedHandler) => wrappedHandler())

            await useTracedAsyncData(originalFn, ['users', handler], 1, 'users', BASE_META)

            const spans = getSpans()

            expect(spans).toHaveLength(1)
            expect(spans[0].type).toBe('fetch')
        })

        it('ends the span with status ok on resolve', async () => {
            const handler = vi.fn().mockResolvedValue('result')
            const originalFn = vi.fn().mockImplementation((_key, wrappedHandler) => wrappedHandler())

            await useTracedAsyncData(originalFn, ['key', handler], 1, 'key', BASE_META)

            expect(getSpans()[0].status).toBe('ok')
        })

        it('passes through the resolved value to the original function', async () => {
            const payload = { id: 1 }
            const handler = vi.fn().mockResolvedValue(payload)
            const originalFn = vi.fn().mockImplementation((_key, wrappedHandler) => wrappedHandler())

            const result = await useTracedAsyncData(originalFn, ['data', handler], 1, 'data', BASE_META)

            expect(result).toEqual(payload)
        })

        it('includes file and line in span metadata', async () => {
            const handler = vi.fn().mockResolvedValue(null)
            const originalFn = vi.fn().mockImplementation((_key, wrappedHandler) => wrappedHandler())

            await useTracedAsyncData(originalFn, ['k', handler], 1, 'k', BASE_META)

            const span = getSpans()[0]

            expect(span.metadata?.file).toBe(BASE_META.file)
            expect(span.metadata?.line).toBe(BASE_META.line)
        })
    })

    describe('handler wrapping on failure', () => {
        it('ends span with error status when the handler rejects', async () => {
            const handler = vi.fn().mockRejectedValue(new Error('fetch failed'))
            const originalFn = vi.fn().mockImplementation((_key, wrappedHandler) =>
                wrappedHandler().catch(() => {}),
            )

            await useTracedAsyncData(originalFn, ['key', handler], 1, 'key', BASE_META)

            expect(getSpans()[0].status).toBe('error')
        })

        it('records the error message in span metadata', async () => {
            const handler = vi.fn().mockRejectedValue(new Error('something broke'))
            const originalFn = vi.fn().mockImplementation((_key, wrappedHandler) =>
                wrappedHandler().catch(() => {}),
            )

            await useTracedAsyncData(originalFn, ['key', handler], 1, 'key', BASE_META)

            expect(getSpans()[0].metadata?.errorMessage).toBe('something broke')
        })

        it('re-throws the error after ending the span', async () => {
            const originalError = new Error('rethrown')
            const handler = vi.fn().mockRejectedValue(originalError)
            const originalFn = vi.fn().mockImplementation((_key, wrappedHandler) => wrappedHandler())

            await expect(useTracedAsyncData(originalFn, ['key', handler], 1, 'key', BASE_META)).rejects.toBe(
                originalError,
            )

            expect(getSpans()[0].status).toBe('error')
        })
    })

    describe('passthrough cases', () => {
        it('calls originalFn unchanged when the value at handlerIndex is not a function', () => {
            const originalFn = vi.fn().mockReturnValue('direct')
            const result = useTracedAsyncData(originalFn, ['key', 'not-a-function'], 1, 'key', BASE_META)

            expect(originalFn).toHaveBeenCalledWith('key', 'not-a-function')
            expect(result).toBe('direct')
            expect(getSpans()).toHaveLength(0)
        })

        it('calls originalFn with the modified args array', async () => {
            const handler = vi.fn().mockResolvedValue(null)
            const originalFn = vi.fn().mockImplementation((_key, wrappedHandler) =>
                wrappedHandler().catch(() => {}),
            )

            await useTracedAsyncData(originalFn, ['key', handler], 1, 'key', BASE_META)

            expect(originalFn).toHaveBeenCalledTimes(1)

            // The second argument passed to originalFn should be the wrapped handler, not the original
            const passedHandler = originalFn.mock.calls[0][1]

            expect(passedHandler).not.toBe(handler)
            expect(typeof passedHandler).toBe('function')
        })
    })
})
