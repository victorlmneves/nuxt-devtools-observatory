import { getCurrentTraceId, setCurrentTraceId } from './context'
import { traceStore, type TraceStore } from './traceStore'
import type { Span, SpanStatus, SpanType, Trace } from './trace'

export interface StartSpanInput {
    name: string
    type: SpanType
    traceId?: string
    parentSpanId?: string
    metadata?: Record<string, unknown>
    startTime?: number
}

export interface EndSpanInput {
    endTime?: number
    status?: SpanStatus
    metadata?: Record<string, unknown>
}

export interface SpanHandle {
    trace: Trace
    span: Span
    end: (input?: EndSpanInput) => Span
}

export interface StartSpanOptions {
    store?: TraceStore
    carrier?: object
    traceName?: string
    traceMetadata?: Record<string, unknown>
}

export function startSpan(input: StartSpanInput, options: StartSpanOptions = {}): SpanHandle {
    const store = options.store ?? traceStore
    const activeTraceId = input.traceId ?? getCurrentTraceId(options.carrier as never)

    let trace = activeTraceId ? store.getTrace(activeTraceId) : undefined

    if (!trace) {
        trace = store.createTrace({
            id: activeTraceId,
            name: options.traceName ?? input.name,
            metadata: options.traceMetadata,
            startTime: input.startTime,
        })
    }

    setCurrentTraceId(trace.id, options.carrier as never)

    const span = store.addSpan({
        traceId: trace.id,
        parentSpanId: input.parentSpanId,
        name: input.name,
        type: input.type,
        metadata: input.metadata,
        startTime: input.startTime,
    })

    let ended = false

    const end = (endInput: EndSpanInput = {}) => {
        if (ended) {
            return span
        }

        const endedSpan = store.endSpan(span.id, trace.id, {
            endTime: endInput.endTime,
            status: endInput.status,
            metadata: endInput.metadata,
        })

        ended = true

        if (endedSpan) {
            span.endTime = endedSpan.endTime
            span.durationMs = endedSpan.durationMs
            span.status = endedSpan.status
            span.metadata = endedSpan.metadata
        }

        return span
    }

    return {
        trace,
        span,
        end,
    }
}
