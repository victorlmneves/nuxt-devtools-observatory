import { describe, it, expect } from 'vitest'
import { buildRenderSummaryForTrace, buildCrossTraceRenderSummary } from '@observatory-client/composables/trace-render-aggregation'
import type { TraceEntry, TraceSpan } from '@observatory/types/snapshot'

function renderSpan(
    id: string,
    traceId: string,
    uid: number,
    componentName: string,
    file: string,
    lifecycle: 'render:mount' | 'render:update',
    durationMs: number
): TraceSpan {
    return {
        id,
        traceId,
        name: 'component:render',
        type: 'render',
        startTime: 0,
        durationMs,
        status: 'ok',
        metadata: {
            uid,
            componentName,
            file,
            lifecycle,
        },
    }
}

function makeTrace(id: string, spans: TraceSpan[]): TraceEntry {
    return {
        id,
        name: `trace:${id}`,
        startTime: 0,
        status: 'ok',
        spans,
    }
}

describe('buildRenderSummaryForTrace', () => {
    it('aggregates render spans by UID', () => {
        const trace = makeTrace('t1', [
            renderSpan('a1', 't1', 10, 'CartDrawer', '/components/CartDrawer.vue', 'render:mount', 4),
            renderSpan('a2', 't1', 10, 'CartDrawer', '/components/CartDrawer.vue', 'render:update', 2),
            renderSpan('b1', 't1', 11, 'PriceBadge', '/components/PriceBadge.vue', 'render:update', 1),
        ])

        const rows = buildRenderSummaryForTrace(trace)
        const cart = rows.find((row) => row.uid === 10)
        const badge = rows.find((row) => row.uid === 11)

        expect(rows).toHaveLength(2)
        expect(cart?.mountCount).toBe(1)
        expect(cart?.rerenderCount).toBe(1)
        expect(cart?.totalMs).toBe(6)
        expect(badge?.mountCount).toBe(0)
        expect(badge?.rerenderCount).toBe(1)
    })
})

describe('buildCrossTraceRenderSummary', () => {
    it('aggregates rerenders across traces by component identity', () => {
        const t1 = makeTrace('t1', [renderSpan('a1', 't1', 1, 'CartDrawer', '/components/CartDrawer.vue', 'render:update', 3)])
        const t2 = makeTrace('t2', [renderSpan('a2', 't2', 9, 'CartDrawer', '/components/CartDrawer.vue', 'render:update', 5)])

        const rows = buildCrossTraceRenderSummary([t1, t2], 't2')
        const cart = rows.find((row) => row.componentName === 'CartDrawer')

        expect(cart).toBeDefined()
        expect(cart?.tracesSeen).toBe(2)
        expect(cart?.totalRerenders).toBe(2)
        expect(cart?.avgRerendersPerTrace).toBe(1)
        expect(cart?.selectedRerenders).toBe(1)
        expect(cart?.baselineRerenders).toBe(1)
        expect(cart?.deltaVsBaseline).toBe(0)
    })

    it('returns empty when there are no traces', () => {
        expect(buildCrossTraceRenderSummary([], undefined)).toEqual([])
    })

    it('computes positive delta when selected trace rerenders more than baseline', () => {
        const t1 = makeTrace('t1', [renderSpan('a1', 't1', 1, 'DashboardGrid', '/components/DashboardGrid.vue', 'render:update', 2)])
        const t2 = makeTrace('t2', [
            renderSpan('a2', 't2', 2, 'DashboardGrid', '/components/DashboardGrid.vue', 'render:update', 2),
            renderSpan('a3', 't2', 2, 'DashboardGrid', '/components/DashboardGrid.vue', 'render:update', 2),
            renderSpan('a4', 't2', 2, 'DashboardGrid', '/components/DashboardGrid.vue', 'render:update', 2),
        ])

        const rows = buildCrossTraceRenderSummary([t1, t2], 't2')
        const grid = rows.find((row) => row.componentName === 'DashboardGrid')

        expect(grid?.selectedRerenders).toBe(3)
        expect(grid?.baselineRerenders).toBe(1)
        expect(grid?.deltaVsBaseline).toBe(2)
    })
})
