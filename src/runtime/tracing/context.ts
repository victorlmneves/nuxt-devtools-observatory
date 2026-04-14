const TRACE_CONTEXT_KEY = '__observatory_trace_context__'

type TraceContextCarrier = {
    [TRACE_CONTEXT_KEY]?: {
        currentTraceId?: string
    }
}

function getGlobalCarrier(): TraceContextCarrier {
    return globalThis as TraceContextCarrier
}

export function setCurrentTraceId(traceId: string | undefined, carrier?: TraceContextCarrier) {
    const target = carrier ?? getGlobalCarrier()

    if (!target[TRACE_CONTEXT_KEY]) {
        target[TRACE_CONTEXT_KEY] = {}
    }

    target[TRACE_CONTEXT_KEY]!.currentTraceId = traceId
}

export function getCurrentTraceId(carrier?: TraceContextCarrier) {
    const target = carrier ?? getGlobalCarrier()

    return target[TRACE_CONTEXT_KEY]?.currentTraceId
}
