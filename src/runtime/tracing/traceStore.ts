import type { ISpan, TSpanStatus, ITrace, TTraceStatus } from './trace'
import { bumpSnapshotRevision } from '../snapshot-revision'

export interface ICreateTraceInput {
    id?: string
    name?: string
    startTime?: number
    metadata?: Record<string, unknown>
}

export interface IAddSpanInput {
    id?: string
    traceId: string
    parentSpanId?: string
    name: string
    type: ISpan['type']
    startTime?: number
    endTime?: number
    status?: TSpanStatus
    metadata?: Record<string, unknown>
}

export interface IEndTraceInput {
    endTime?: number
    status?: TTraceStatus
    metadata?: Record<string, unknown>
}

function createId(prefix: string) {
    return `${prefix}_${Date.now()}_${crypto.randomUUID()}`
}

function computeDuration(startTime: number, endTime: number) {
    return Math.max(endTime - startTime, 0)
}

export class TraceStore {
    private readonly traces = new Map<string, ITrace>()
    private maxTraces: number

    constructor(maxTraces = 50) {
        this.maxTraces = Math.max(1, maxTraces)
    }

    setMaxTraces(maxTraces: number) {
        this.maxTraces = Math.max(1, maxTraces)
        this.evictOverflow()
    }

    createTrace(input: ICreateTraceInput = {}): ITrace {
        this.evictOverflow(1)

        const startTime = input.startTime ?? performance.now()
        const trace: ITrace = {
            id: input.id ?? createId('trace'),
            name: input.name ?? 'trace',
            startTime,
            status: 'active',
            metadata: input.metadata,
            spans: [],
        }

        this.traces.set(trace.id, trace)
        bumpSnapshotRevision()

        return trace
    }

    addSpan(input: IAddSpanInput): ISpan {
        const trace = this.ensureTrace(input.traceId, input.startTime)
        const startTime = input.startTime ?? performance.now()
        const endTime = input.endTime
        const span: ISpan = {
            id: input.id ?? createId('span'),
            traceId: trace.id,
            parentSpanId: input.parentSpanId,
            name: input.name,
            type: input.type,
            startTime,
            endTime,
            durationMs: endTime !== undefined ? computeDuration(startTime, endTime) : undefined,
            status: input.status ?? (endTime !== undefined ? 'ok' : 'active'),
            metadata: input.metadata,
        }

        trace.spans.push(span)
        bumpSnapshotRevision()

        if (trace.endTime !== undefined) {
            trace.durationMs = computeDuration(trace.startTime, trace.endTime)
        }

        return span
    }

    endTrace(traceId: string, input: IEndTraceInput = {}): ITrace | null {
        const trace = this.traces.get(traceId)

        if (!trace) {
            return null
        }

        const endTime = input.endTime ?? performance.now()
        trace.endTime = endTime
        trace.durationMs = computeDuration(trace.startTime, endTime)
        trace.status = input.status ?? 'ok'

        if (input.metadata) {
            trace.metadata = {
                ...(trace.metadata ?? {}),
                ...input.metadata,
            }
        }

        bumpSnapshotRevision()

        return trace
    }

    endSpan(spanId: string, traceId: string, input: { endTime?: number; status?: TSpanStatus; metadata?: Record<string, unknown> } = {}) {
        const trace = this.traces.get(traceId)

        if (!trace) {
            return null
        }

        const span = trace.spans.find((item) => item.id === spanId)

        if (!span) {
            return null
        }

        const endTime = input.endTime ?? performance.now()
        span.endTime = endTime
        span.durationMs = computeDuration(span.startTime, endTime)
        span.status = input.status ?? 'ok'

        if (input.metadata) {
            span.metadata = {
                ...(span.metadata ?? {}),
                ...input.metadata,
            }
        }

        bumpSnapshotRevision()

        return span
    }

    getTrace(traceId: string) {
        return this.traces.get(traceId)
    }

    getAllTraces() {
        return [...this.traces.values()]
    }

    clear() {
        if (this.traces.size === 0) {
            return
        }

        this.traces.clear()
        bumpSnapshotRevision()
    }

    private evictOverflow(roomFor = 0) {
        while (this.traces.size + roomFor > this.maxTraces) {
            if (!this.evictOne()) {
                break
            }
        }
    }

    private evictOne(): boolean {
        for (const [id, trace] of this.traces) {
            if (trace.status !== 'active') {
                this.traces.delete(id)

                return true
            }
        }

        const oldest = this.traces.keys().next().value

        if (oldest === undefined) {
            return false
        }

        this.traces.delete(oldest)

        return true
    }

    private ensureTrace(traceId: string, startTime?: number) {
        const existing = this.traces.get(traceId)

        if (existing) {
            return existing
        }

        const trace = this.createTrace({ id: traceId, startTime })

        return trace
    }
}

export const traceStore = new TraceStore()
