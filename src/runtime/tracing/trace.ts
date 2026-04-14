export type SpanType =
    | 'render'
    | 'component'
    | 'transition'
    | 'fetch'
    | 'composable'
    | 'navigation'
    | 'custom'
    | (string & {})

export type SpanStatus = 'active' | 'ok' | 'error' | 'cancelled'

export interface Span {
    id: string
    traceId: string
    parentSpanId?: string
    name: string
    type: SpanType
    startTime: number
    endTime?: number
    durationMs?: number
    status: SpanStatus
    metadata?: Record<string, unknown>
}

export type TraceStatus = 'active' | 'ok' | 'error' | 'cancelled'

export interface Trace {
    id: string
    name: string
    startTime: number
    endTime?: number
    durationMs?: number
    status: TraceStatus
    metadata?: Record<string, unknown>
    spans: Span[]
}
