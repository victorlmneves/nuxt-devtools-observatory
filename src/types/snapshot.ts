/**
 * Shared data-shape types for Observatory snapshot data.
 * These are used by both the module server side (src/) and the iframe client (client/).
 */

export interface FetchEntry {
    id: string
    key: string
    url: string
    status: 'pending' | 'ok' | 'error' | 'cached'
    origin: 'ssr' | 'csr'
    startTime: number
    endTime?: number
    ms?: number
    size?: number
    cached: boolean
    payload?: unknown
    error?: unknown
    file?: string
    line?: number
}

export interface ProvideEntry {
    key: string
    componentName: string
    componentFile: string
    componentUid: number
    parentUid?: number
    parentFile?: string
    isReactive: boolean
    valueSnapshot: unknown
    line: number
    scope: 'global' | 'layout' | 'component'
    isShadowing: boolean
}

export interface InjectEntry {
    key: string
    componentName: string
    componentFile: string
    componentUid: number
    parentUid?: number
    parentFile?: string
    resolved: boolean
    resolvedFromFile?: string
    resolvedFromUid?: number
    line: number
}

export interface RefChangeEvent {
    t: number
    key: string
    value: unknown
}

export interface ComposableEntry {
    id: string
    name: string
    componentFile: string
    componentUid: number
    status: 'mounted' | 'unmounted'
    leak: boolean
    leakReason?: string
    refs: Record<string, { type: 'ref' | 'computed' | 'reactive'; value: unknown }>
    history: RefChangeEvent[]
    sharedKeys: string[]
    sharedKeyGroups?: Record<string, string>
    watcherCount: number
    intervalCount: number
    lifecycle: {
        hasOnMounted: boolean
        hasOnUnmounted: boolean
        watchersCleaned: boolean
        intervalsCleaned: boolean
    }
    file: string
    line: number
    route?: string
    callerComponentFile?: string
    isLayoutComposable?: boolean
}

export interface PiniaStateDiff {
    path: string
    before: unknown
    after: unknown
}

export interface PiniaStoreDependency {
    id: string
    kind: 'component' | 'composable' | 'unknown'
    name: string
    file?: string
}

export interface PiniaHydrationEvent {
    at: number
    source: 'nuxt-payload' | 'persistedstate' | 'runtime' | 'unknown'
    details?: string
}

export interface PiniaMutationEvent {
    id: string
    storeId: string
    storeName: string
    kind: 'action' | 'mutation'
    name: string
    startTime: number
    endTime?: number
    durationMs?: number
    status: 'active' | 'ok' | 'error'
    beforeState: unknown
    afterState: unknown
    diff: PiniaStateDiff[]
    callerStack?: string[]
    payload?: unknown
    error?: string
}

export interface PiniaStoreEntry {
    id: string
    name: string
    state: unknown
    dependencies: PiniaStoreDependency[]
    timeline: PiniaMutationEvent[]
    lastMutationAt?: number
    lastActionAt?: number
    hydration?: PiniaHydrationEvent
}

export interface RenderEvent {
    kind: 'mount' | 'update'
    t: number
    durationMs: number
    triggerKey?: string
    route: string
}

export interface RenderEntry {
    uid: number
    name: string
    file: string
    element?: string
    mountCount: number
    rerenders: number
    totalMs: number
    avgMs: number
    triggers: Array<{ key: string; type: string; timestamp: number }>
    timeline: RenderEvent[]
    rect?: { x: number; y: number; width: number; height: number; top: number; left: number }
    parentUid?: number
    isPersistent: boolean
    isHydrationMount: boolean
    route: string
}

export interface TransitionEntry {
    id: string
    transitionName: string
    parentComponent: string
    direction: 'enter' | 'leave'
    phase: 'entering' | 'entered' | 'leaving' | 'left' | 'enter-cancelled' | 'leave-cancelled' | 'interrupted'
    startTime: number
    endTime?: number
    durationMs?: number
    cancelled: boolean
    appear: boolean
    mode?: string
}

export interface TraceSpan {
    id: string
    traceId: string
    parentSpanId?: string
    name: string
    type: string
    startTime: number
    endTime?: number
    durationMs?: number
    status: 'active' | 'ok' | 'error' | 'cancelled'
    metadata?: Record<string, unknown>
}

export interface TraceEntry {
    id: string
    name: string
    startTime: number
    endTime?: number
    durationMs?: number
    status: 'active' | 'ok' | 'error' | 'cancelled'
    metadata?: Record<string, unknown>
    spans: TraceSpan[]
}
