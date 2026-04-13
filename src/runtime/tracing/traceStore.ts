import type { Span, SpanStatus, Trace, TraceStatus } from './trace'

export interface CreateTraceInput {
    id?: string
    name?: string
    startTime?: number
    metadata?: Record<string, unknown>
}

export interface AddSpanInput {
    id?: string
    traceId: string
    parentSpanId?: string
    name: string
    type: Span['type']
    startTime?: number
    endTime?: number
    status?: SpanStatus
    metadata?: Record<string, unknown>
}

export interface EndTraceInput {
    endTime?: number
    status?: TraceStatus
    metadata?: Record<string, unknown>
}

function createId(prefix: string) {
    const random = Math.random().toString(36).slice(2, 10)

    return `${prefix}_${Date.now()}_${random}`
}

function computeDuration(startTime: number, endTime: number) {
    return Math.max(endTime - startTime, 0)
}

export class TraceStore {
    private readonly traces = new Map<string, Trace>()

    createTrace(input: CreateTraceInput = {}): Trace {
        const startTime = input.startTime ?? performance.now()
        const trace: Trace = {
            id: input.id ?? createId('trace'),
            name: input.name ?? 'trace',
            startTime,
            status: 'active',
            metadata: input.metadata,
            spans: [],
        }

        this.traces.set(trace.id, trace)

        return trace
    }

    addSpan(input: AddSpanInput): Span {
        const trace = this.ensureTrace(input.traceId, input.startTime)
        const startTime = input.startTime ?? performance.now()
        const endTime = input.endTime
        const span: Span = {
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

        if (trace.endTime !== undefined) {
            trace.durationMs = computeDuration(trace.startTime, trace.endTime)
        }

        return span
    }

    endTrace(traceId: string, input: EndTraceInput = {}): Trace | null {
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

        return trace
    }

    endSpan(spanId: string, traceId: string, input: { endTime?: number; status?: SpanStatus; metadata?: Record<string, unknown> } = {}) {
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

        return span
    }

    getTrace(traceId: string) {
        return this.traces.get(traceId)
    }

    getAllTraces() {
        return [...this.traces.values()]
    }

    clear() {
        this.traces.clear()
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
