import type { SpanStatus, TraceStatus } from './trace'
import { traceStore, type TraceStore } from './traceStore'

export interface MergeableSsrSpan {
    id: string
    name: string
    type: string
    startTime: number
    endTime?: number
    durationMs?: number
    status: SpanStatus
    metadata?: Record<string, unknown>
}

export interface MergeableSsrRecord {
    traceId: string
    name: string
    spans: MergeableSsrSpan[]
}

/**
 * Merge an SSR/Nitro trace record into the client `traceStore`.
 * Duplicate `traceId`s are reused (no second trace). Duplicate span `id`s
 * inside that trace are skipped so HTML inject + archive fetch can be applied
 * twice without doubling spans; additional span ids from a later snapshot
 * are still appended.
 * @param {MergeableSsrRecord} record - Serialized record from HTML inject or the nitro-timeline archive.
 * @param {object} [options] - Optional store and clock overrides for tests.
 * @param {TraceStore} [options.store] - Trace store to merge into. Defaults to the singleton.
 * @param {number} [options.now] - Clock reading used to anchor relative span times.
 * @returns {boolean} `true` when the record was applied (including no-op span dedupe).
 */
export function mergeSsrTraceRecord(record: MergeableSsrRecord, options?: { store?: TraceStore; now?: number }): boolean {
    if (!record?.traceId || !Array.isArray(record.spans)) {
        return false
    }

    const store = options?.store ?? traceStore
    const now = options?.now ?? performance.now()
    const existing = store.getTrace(record.traceId)
    const navDurationMs = record.spans[0]?.durationMs ?? 0
    const traceStartTime = existing?.startTime ?? now - navDurationMs
    const hasError = record.spans.some((span) => span.status === 'error') || existing?.status === 'error'
    const endStatus: TraceStatus = hasError ? 'error' : 'ok'

    if (!existing) {
        store.createTrace({
            id: record.traceId,
            name: record.name,
            startTime: traceStartTime,
            metadata: { origin: 'ssr' },
        })
    }

    const knownSpanIds = new Set((store.getTrace(record.traceId)?.spans ?? []).map((span) => span.id))

    for (const span of record.spans) {
        if (knownSpanIds.has(span.id)) {
            continue
        }

        store.addSpan({
            id: span.id,
            traceId: record.traceId,
            name: span.name,
            type: span.type,
            startTime: traceStartTime + span.startTime,
            endTime: span.endTime !== undefined ? traceStartTime + span.endTime : undefined,
            status: span.status,
            metadata: { ...(span.metadata ?? {}), origin: 'ssr' },
        })
        knownSpanIds.add(span.id)
    }

    store.endTrace(record.traceId, {
        endTime: traceStartTime + navDurationMs,
        status: endStatus,
        metadata: { origin: 'ssr' },
    })

    return true
}
