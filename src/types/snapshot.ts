/**
 * Shared data-shape types for Observatory snapshot data.
 * These are used by both the module server side (src/) and the iframe client (client/).
 */

export interface IFetchEntry {
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
    method?: string
    source?: string
}

export interface IProvideEntry {
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

export interface IInjectEntry {
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

export interface IRefChangeEvent {
    t: number
    key: string
    value: unknown
}

export interface IComposableEntry {
    id: string
    name: string
    componentFile: string
    componentUid: number
    status: 'mounted' | 'unmounted'
    leak: boolean
    leakReason?: string
    refs: Record<string, { type: 'ref' | 'computed' | 'reactive'; value: unknown }>
    history: IRefChangeEvent[]
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

export interface IPiniaStateDiff {
    path: string
    before: unknown
    after: unknown
}

export interface IPiniaStoreDependency {
    id: string
    kind: 'component' | 'composable' | 'unknown'
    name: string
    file?: string
}

export interface IPiniaHydrationEvent {
    at: number
    source: 'nuxt-payload' | 'persistedstate' | 'runtime' | 'unknown'
    details?: string
}

export interface IPiniaMutationEvent {
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
    diff: IPiniaStateDiff[]
    callerStack?: string[]
    payload?: unknown
    error?: string
}

export interface IPiniaStoreEntry {
    id: string
    name: string
    state: unknown
    dependencies: IPiniaStoreDependency[]
    timeline: IPiniaMutationEvent[]
    hydrationTimeline: IPiniaHydrationEvent[]
    lastMutationAt?: number
    lastActionAt?: number
    hydration?: IPiniaHydrationEvent
}

export interface IRenderEvent {
    kind: 'mount' | 'update'
    t: number
    durationMs: number
    triggerKey?: string
    route: string
}

export interface IRenderEntry {
    uid: number
    name: string
    file: string
    element?: string
    mountCount: number
    rerenders: number
    totalMs: number
    avgMs: number
    triggers: Array<{ key: string; type: string; timestamp: number }>
    timeline: IRenderEvent[]
    rect?: { x: number; y: number; width: number; height: number; top: number; left: number }
    parentUid?: number
    isPersistent: boolean
    isHydrationMount: boolean
    route: string
}

export interface ITransitionEntry {
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
    /** Built-in Vue component that produced the event. */
    component?: 'Transition' | 'TransitionGroup'
}

export interface ITraceSpan {
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

export interface ITraceEntry {
    id: string
    name: string
    startTime: number
    endTime?: number
    durationMs?: number
    status: 'active' | 'ok' | 'error' | 'cancelled'
    metadata?: Record<string, unknown>
    spans: ITraceSpan[]
}

export type TPayloadBucket = 'data' | 'state' | 'pinia' | 'error' | 'other'

export interface IPayloadKeyEntry {
    id: string
    bucket: TPayloadBucket
    key: string
    bytes: number
    origin: 'ssr' | 'csr'
    preview?: unknown
}

export type TStateCookieKind = 'useState' | 'useCookie'

export interface IStateCookieEntry {
    id: string
    kind: TStateCookieKind
    key: string
    origin: 'ssr' | 'csr'
    preview?: unknown
    updatedAt: number
    file?: string
    line?: number
    cookie?: {
        maxAge?: number
        path?: string
        httpOnly?: boolean
    }
}

export interface IPayloadInspectorSnapshot {
    capturedAt: number
    isHydrating: boolean
    serverRendered: boolean
    keyCount: number
    totalBytes: number
    keys: IPayloadKeyEntry[]
}
