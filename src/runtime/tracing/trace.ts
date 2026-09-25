export type TSpanType = 'render' | 'component' | 'transition' | 'fetch' | 'composable' | 'navigation' | 'error' | 'custom' | (string & {})

export type TSpanStatus = 'active' | 'ok' | 'error' | 'cancelled'

export interface ISpan {
    id: string
    traceId: string
    parentSpanId?: string
    name: string
    type: TSpanType
    startTime: number
    endTime?: number
    durationMs?: number
    status: TSpanStatus
    metadata?: Record<string, unknown>
}

export type TTraceStatus = 'active' | 'ok' | 'error' | 'cancelled'

export interface ITrace {
    id: string
    name: string
    startTime: number
    endTime?: number
    durationMs?: number
    status: TTraceStatus
    metadata?: Record<string, unknown>
    spans: ISpan[]
}
