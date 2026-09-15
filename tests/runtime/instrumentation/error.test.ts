import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupErrorInstrumentation, recordErrorSpan } from '@observatory/runtime/instrumentation/error'
import { setupRouteInstrumentation } from '@observatory/runtime/instrumentation/route'
import { traceStore } from '@observatory/runtime/tracing/traceStore'
import { setCurrentTraceId } from '@observatory/runtime/tracing/context'
import type { NuxtApp } from '#app'

const TRACE_CONTEXT_KEY = '__observatory_trace_context__'

beforeEach(() => {
    traceStore.clear()
    delete (globalThis as Record<string, unknown>)[TRACE_CONTEXT_KEY]
})

function createMockApp() {
    const hooks: Record<string, Array<(...args: unknown[]) => void>> = {}
    const onError = vi.fn()

    const nuxtApp = {
        hook: (event: string, cb: (...args: unknown[]) => void) => {
            hooks[event] ??= []
            hooks[event].push(cb)
        },
        $router: {
            onError: (handler: (error: unknown) => void) => {
                onError.mockImplementation(handler)
            },
        },
    } as unknown as NuxtApp

    function trigger(event: string, ...args: unknown[]) {
        hooks[event]?.forEach((cb) => cb(...args))
    }

    return { nuxtApp, trigger, onError }
}

describe('recordErrorSpan', () => {
    it('creates an error span with message and stack from an Error', () => {
        const error = new Error('boom')
        const span = recordErrorSpan('vue', error, { component: 'ShopPage' })

        expect(span.type).toBe('error')
        expect(span.status).toBe('error')
        expect(span.name).toBe('error:vue')
        expect(span.metadata?.message).toBe('boom')
        expect(span.metadata?.component).toBe('ShopPage')
        expect(span.metadata?.stack).toEqual(expect.any(String))
    })

    it('marks the active route trace as error', () => {
        const { nuxtApp, trigger, options } = (() => {
            const hooks: Record<string, Array<() => void>> = {}
            const nuxtApp = {
                hook: (event: string, cb: () => void) => {
                    hooks[event] ??= []
                    hooks[event].push(cb)
                },
            } as unknown as NuxtApp

            return {
                nuxtApp,
                trigger: (event: string) => hooks[event]?.forEach((cb) => cb()),
                options: { getCurrentPath: () => '/shop' },
            }
        })()

        setupRouteInstrumentation(nuxtApp, options)
        trigger('page:start')

        recordErrorSpan('app', { message: 'createError', statusCode: 404 })

        const trace = traceStore.getAllTraces()[0]

        expect(trace.status).toBe('error')
        expect(trace.metadata?.hasError).toBe(true)
        expect(trace.spans.some((span) => span.type === 'error')).toBe(true)
    })
})

describe('setupErrorInstrumentation', () => {
    it('records vue:error with component name', () => {
        const { nuxtApp, trigger } = createMockApp()
        setupErrorInstrumentation(nuxtApp)

        setCurrentTraceId('manual')
        traceStore.createTrace({ id: 'manual', name: 'route:/' })

        trigger('vue:error', new Error('render failed'), { type: { __name: 'ProductCard' } }, 'render')

        const span = traceStore.getTrace('manual')?.spans[0]

        expect(span?.name).toBe('error:vue')
        expect(span?.metadata?.component).toBe('ProductCard')
        expect(span?.metadata?.info).toBe('render')
    })

    it('records app:error from createError/showError', () => {
        const { nuxtApp, trigger } = createMockApp()
        setupErrorInstrumentation(nuxtApp)
        trigger('app:error', { message: 'Page not found', statusCode: 404 })

        const spans = traceStore.getAllTraces().flatMap((trace) => trace.spans)

        expect(spans).toHaveLength(1)
        expect(spans[0].name).toBe('error:app')
        expect(spans[0].metadata?.statusCode).toBe(404)
    })

    it('records router.onError as a navigation error span', () => {
        const { nuxtApp, onError } = createMockApp()
        setupErrorInstrumentation(nuxtApp)

        onError(new Error('navigation aborted'))

        const spans = traceStore.getAllTraces().flatMap((trace) => trace.spans)

        expect(spans[0].name).toBe('error:navigation')
        expect(spans[0].metadata?.message).toBe('navigation aborted')
    })
})

describe('page:finish after an error', () => {
    it('ends the route trace with status error', () => {
        const hooks: Record<string, Array<() => void>> = {}
        const nuxtApp = {
            hook: (event: string, cb: () => void) => {
                hooks[event] ??= []
                hooks[event].push(cb)
            },
        } as unknown as NuxtApp

        setupRouteInstrumentation(nuxtApp, { getCurrentPath: () => '/fail' })
        hooks['page:start']?.forEach((cb) => cb())
        recordErrorSpan('vue', new Error('setup exploded'))
        hooks['page:finish']?.forEach((cb) => cb())

        expect(traceStore.getAllTraces()[0].status).toBe('error')
    })
})
