import { getCurrentTraceId, setCurrentTraceId } from './context'
import { traceStore, type TraceStore } from './traceStore'
import type { ISpan, TSpanStatus, TSpanType, ITrace } from './trace'

export interface IStartSpanInput {
    name: string
    type: TSpanType
    traceId?: string
    parentSpanId?: string
    metadata?: Record<string, unknown>
    startTime?: number
}

export interface IEndSpanInput {
    endTime?: number
    status?: TSpanStatus
    metadata?: Record<string, unknown>
}

export interface ISpanHandle {
    trace: ITrace
    span: ISpan
    end: (input?: IEndSpanInput) => ISpan
}

export interface IStartSpanOptions {
    store?: TraceStore
    carrier?: object
    traceName?: string
    traceMetadata?: Record<string, unknown>
}

export function startSpan(input: IStartSpanInput, options: IStartSpanOptions = {}): ISpanHandle {
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

    const end = (endInput: IEndSpanInput = {}) => {
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
