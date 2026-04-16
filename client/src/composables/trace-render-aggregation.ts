import type { TraceEntry, TraceSpan } from '@observatory/types/snapshot'

interface SpanMetadata {
    uid?: string | number
    componentName?: string
    file?: string
    lifecycle?: string
}

export interface TraceRenderStatsRow {
    componentKey: string
    componentName: string
    file: string
    uid: string | number
    mountCount: number
    rerenderCount: number
    totalMs: number
    avgMs: number
}

export interface CrossTraceRenderSummaryRow {
    componentKey: string
    componentName: string
    file: string
    tracesSeen: number
    avgRerendersPerTrace: number
    totalRerenders: number
    totalMs: number
    avgMsPerRender: number
    selectedUid?: string | number
    selectedRerenders?: number
    baselineRerenders?: number
    deltaVsBaseline?: number
}

function asMetadata(span: TraceSpan): SpanMetadata {
    return ((span.metadata as Record<string, unknown> | undefined) ?? {}) as SpanMetadata
}

function normalizeMs(value?: number): number {
    return Number.isFinite(value) ? (value as number) : 0
}

function getComponentIdentity(metadata: SpanMetadata, fallbackId: string): { key: string; name: string; file: string } {
    const name = String(metadata.componentName ?? '').trim()
    const file = String(metadata.file ?? '').trim()

    if (name && file) {
        return {
            key: `${file}::${name}`,
            name,
            file,
        }
    }

    if (name) {
        return {
            key: `name::${name}`,
            name,
            file,
        }
    }

    return {
        key: `unknown::${fallbackId}`,
        name: fallbackId,
        file,
    }
}

/**
 * Build per-trace render stats grouped by component UID.
 * @param {TraceEntry | undefined} trace - Trace to summarize.
 * @returns {TraceRenderStatsRow[]} Render metrics grouped by component uid.
 */
export function buildRenderSummaryForTrace(trace?: TraceEntry): TraceRenderStatsRow[] {
    if (!trace) {
        return []
    }

    const byUid = new Map<string | number, { key: string; name: string; file: string; spans: TraceSpan[] }>()

    for (const span of trace.spans) {
        if (span.type !== 'render') {
            continue
        }

        const metadata = asMetadata(span)
        const uid = (metadata.uid as string | number | undefined) ?? span.id
        const identity = getComponentIdentity(metadata, String(uid))

        if (!byUid.has(uid)) {
            byUid.set(uid, {
                key: identity.key,
                name: identity.name,
                file: identity.file,
                spans: [],
            })
        }

        byUid.get(uid)!.spans.push(span)
    }

    const rows: TraceRenderStatsRow[] = []

    for (const [uid, { key, name, file, spans }] of byUid) {
        let mountCount = 0
        let rerenderCount = 0
        let totalMs = 0

        for (const span of spans) {
            const lifecycle = String(asMetadata(span).lifecycle ?? '')
            const ms = normalizeMs(span.durationMs)

            if (lifecycle === 'render:mount') {
                mountCount++
            } else {
                rerenderCount++
            }

            totalMs += ms
        }

        const totalRenders = mountCount + rerenderCount
        rows.push({
            componentKey: key,
            componentName: name || String(uid),
            file,
            uid,
            mountCount,
            rerenderCount,
            totalMs,
            avgMs: totalRenders > 0 ? totalMs / totalRenders : 0,
        })
    }

    rows.sort((a, b) => b.rerenderCount - a.rerenderCount || b.totalMs - a.totalMs)

    return rows
}

/**
 * Build cross-trace render aggregation and comparison against a selected trace.
 * @param {TraceEntry[]} traces - Traces included in the aggregation window.
 * @param {string | undefined} selectedTraceId - Optional selected trace for baseline comparison.
 * @returns {CrossTraceRenderSummaryRow[]} Aggregated comparison rows by component identity.
 */
export function buildCrossTraceRenderSummary(traces: TraceEntry[], selectedTraceId?: string): CrossTraceRenderSummaryRow[] {
    if (traces.length === 0) {
        return []
    }

    const aggregate = new Map<
        string,
        {
            componentName: string
            file: string
            tracesSeen: number
            totalRerenders: number
            totalRenders: number
            totalMs: number
            selectedUid?: string | number
            selectedRerenders?: number
        }
    >()

    for (const trace of traces) {
        const rows = buildRenderSummaryForTrace(trace)

        // Collapse multiple UIDs for the same component identity within one trace.
        const perTrace = new Map<
            string,
            { name: string; file: string; rerenders: number; renders: number; ms: number; uid: string | number; peakUidRerenders: number }
        >()

        for (const row of rows) {
            const existing = perTrace.get(row.componentKey)

            if (!existing) {
                perTrace.set(row.componentKey, {
                    name: row.componentName,
                    file: row.file,
                    rerenders: row.rerenderCount,
                    renders: row.mountCount + row.rerenderCount,
                    ms: row.totalMs,
                    uid: row.uid,
                    peakUidRerenders: row.rerenderCount,
                })
                continue
            }

            existing.rerenders += row.rerenderCount
            existing.renders += row.mountCount + row.rerenderCount
            existing.ms += row.totalMs

            // Keep the UID with higher re-render count for potential highlight mapping.
            if (row.rerenderCount > existing.peakUidRerenders) {
                existing.uid = row.uid
                existing.peakUidRerenders = row.rerenderCount
            }
        }

        for (const [componentKey, value] of perTrace) {
            if (!aggregate.has(componentKey)) {
                aggregate.set(componentKey, {
                    componentName: value.name,
                    file: value.file,
                    tracesSeen: 0,
                    totalRerenders: 0,
                    totalRenders: 0,
                    totalMs: 0,
                })
            }

            const target = aggregate.get(componentKey)!
            target.tracesSeen += 1
            target.totalRerenders += value.rerenders
            target.totalRenders += value.renders
            target.totalMs += value.ms

            if (selectedTraceId && trace.id === selectedTraceId) {
                target.selectedUid = value.uid
                target.selectedRerenders = value.rerenders
            }
        }
    }

    const rows: CrossTraceRenderSummaryRow[] = []

    for (const [componentKey, value] of aggregate) {
        const avgRerendersPerTrace = value.tracesSeen > 0 ? value.totalRerenders / value.tracesSeen : 0
        const avgMsPerRender = value.totalRenders > 0 ? value.totalMs / value.totalRenders : 0

        let baselineRerenders: number | undefined
        let deltaVsBaseline: number | undefined

        if (value.selectedRerenders !== undefined && value.tracesSeen > 1) {
            const others = value.tracesSeen - 1
            const othersTotal = value.totalRerenders - value.selectedRerenders
            baselineRerenders = others > 0 ? othersTotal / others : 0
            deltaVsBaseline = value.selectedRerenders - baselineRerenders
        }

        rows.push({
            componentKey,
            componentName: value.componentName,
            file: value.file,
            tracesSeen: value.tracesSeen,
            avgRerendersPerTrace,
            totalRerenders: value.totalRerenders,
            totalMs: value.totalMs,
            avgMsPerRender,
            selectedUid: value.selectedUid,
            selectedRerenders: value.selectedRerenders,
            baselineRerenders,
            deltaVsBaseline,
        })
    }

    rows.sort((a, b) => b.avgRerendersPerTrace - a.avgRerendersPerTrace || b.totalMs - a.totalMs)

    return rows
}
