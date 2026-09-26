import { describe, expect, it } from 'vitest'
import { getSpanTypesFromTraces, useTraceFilter } from '@observatory-client/composables/useTraceFilter'
import type { ITraceEntry, ITraceSpan } from '@observatory/types/snapshot'

function span(overrides?: Partial<ITraceSpan>): ITraceSpan {
    return {
        id: 'span-1',
        traceId: 'trace-1',
        name: 'fetch:products',
        type: 'fetch',
        startTime: 0,
        status: 'ok',
        ...overrides,
    }
}

function trace(overrides?: Partial<ITraceEntry>): ITraceEntry {
    return {
        id: 'trace-1',
        name: 'route:home',
        startTime: 0,
        status: 'ok',
        spans: [span()],
        ...overrides,
    }
}

describe('getSpanTypesFromTraces', () => {
    it('returns unique span types in locale order', () => {
        const traces = [
            trace({
                spans: [span({ type: 'render' }), span({ type: 'Z' }), span({ type: 'a' })],
            }),
            trace({
                id: 'trace-2',
                spans: [span({ type: 'render' })],
            }),
        ]

        expect(getSpanTypesFromTraces(traces)).toEqual(['a', 'render', 'Z'].sort((left, right) => left.localeCompare(right)))
    })
})

describe('useTraceFilter search', () => {
    it('keeps every trace when the query is empty', () => {
        const { filterTraces } = useTraceFilter()

        expect(filterTraces([trace(), trace({ id: 'trace-2', name: 'route:about' })])).toHaveLength(2)
    })

    it('matches the trace name, a span name, or a string span metadata value', () => {
        const { filterTraces, searchQuery } = useTraceFilter()
        const traces = [
            trace({ id: 'by-name', name: 'Checkout Flow' }),
            trace({
                id: 'by-span',
                name: 'other',
                spans: [span({ name: 'render:CartDrawer' })],
            }),
            trace({
                id: 'by-metadata',
                name: 'other',
                spans: [span({ name: 'http', metadata: { url: 'https://api.example/cart', status: 200 } })],
            }),
            trace({ id: 'miss', name: 'other', spans: [span({ name: 'idle' })] }),
        ]

        searchQuery.value = 'CART'

        expect(filterTraces(traces).map((entry) => entry.id)).toEqual(['by-span', 'by-metadata'])

        searchQuery.value = 'checkout'
        expect(filterTraces(traces).map((entry) => entry.id)).toEqual(['by-name'])
    })

    it('ignores non-string metadata and trace-level metadata', () => {
        const { filterTraces, searchQuery } = useTraceFilter()
        const traces = [
            trace({
                id: 'numeric',
                metadata: { route: '/hidden-route' },
                spans: [span({ metadata: { status: 404, route: '/products' } })],
            }),
        ]

        searchQuery.value = '404'
        expect(filterTraces(traces)).toEqual([])

        searchQuery.value = 'hidden-route'
        expect(filterTraces(traces)).toEqual([])

        searchQuery.value = 'products'
        expect(filterTraces(traces).map((entry) => entry.id)).toEqual(['numeric'])
    })
})

describe('useTraceFilter route filter', () => {
    it('matches string route and path metadata and skips non-strings', () => {
        const { filterTraces, routeFilter } = useTraceFilter()
        const traces = [
            trace({
                id: 'trace-route',
                metadata: { route: '/Checkout' },
                spans: [span({ metadata: { route: { name: 'ignored' } } })],
            }),
            trace({
                id: 'span-path',
                spans: [span({ metadata: { path: '/cart/items' } })],
            }),
            trace({
                id: 'object-path',
                spans: [span({ metadata: { path: { href: '/cart' } } })],
            }),
        ]

        routeFilter.value = 'checkout'
        expect(filterTraces(traces).map((entry) => entry.id)).toEqual(['trace-route'])

        routeFilter.value = 'cart'
        expect(filterTraces(traces).map((entry) => entry.id)).toEqual(['span-path'])

        routeFilter.value = '[object Object]'
        expect(filterTraces(traces)).toEqual([])
    })
})
