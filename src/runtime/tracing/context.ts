const TRACE_CONTEXT_KEY = '__observatory_trace_context__'

type TTraceContextCarrier = {
    [TRACE_CONTEXT_KEY]?: {
        currentTraceId?: string
    }
}

function getGlobalCarrier(): TTraceContextCarrier {
    return globalThis as TTraceContextCarrier
}

export function setCurrentTraceId(traceId: string | undefined, carrier?: TTraceContextCarrier) {
    const target = carrier ?? getGlobalCarrier()
    const context = (target[TRACE_CONTEXT_KEY] ??= {})

    context.currentTraceId = traceId
}

export function getCurrentTraceId(carrier?: TTraceContextCarrier) {
    const target = carrier ?? getGlobalCarrier()

    return target[TRACE_CONTEXT_KEY]?.currentTraceId
}
