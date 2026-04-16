// Complete type definitions for Observatory data structures - NO unused exports

export interface TraceEntry {
    id: string
    route: string
    startTime: number
    endTime: number
    spans: Span[]
    metadata: Record<string, unknown>
}

export interface Span {
    id: string
    parentId?: string
    type: SpanType
    name: string
    startTime: number
    endTime: number
    duration: number
    metadata: Record<string, unknown>
}

export type SpanType = 'navigation' | 'component' | 'render' | 'fetch' | 'server' | 'composable' | 'transition'

export interface HeatmapData {
    components: Record<string, ComponentHeatmapData>
}

export interface ComponentHeatmapData {
    totalRenders: number
    totalDuration: number
    byRoute: Record<string, RouteHeatmapData>
    timeline: TimelineEvent[]
}

export interface RouteHeatmapData {
    renders: number
    duration: number
}

export interface TimelineEvent {
    timestamp: number
    type: 'mount' | 'update'
    duration: number
    route: string
    triggerKey?: string
}

export interface ComposableEntry {
    name: string
    id: string
    status: ComposableStatus
    state: Record<string, ComposableStateValue>
    history: HistoryEvent[]
    leaks?: LeakInfo
}

export type ComposableStatus = 'active' | 'unmounted' | 'leaked'

export interface ComposableStateValue {
    value: unknown
    global: boolean
    type: 'ref' | 'computed' | 'reactive'
}

export interface HistoryEvent {
    key: string
    value: unknown
    timestamp: number
}

export interface LeakInfo {
    watchers: number
    intervals: number
}

export interface FetchEntry {
    key: string
    url: string
    status: FetchStatus
    duration: number
    origin: 'ssr' | 'csr'
    startOffset: number
    cacheKey?: string
}

export type FetchStatus = 'pending' | 'success' | 'error'

export interface GraphData {
    provides: ProvideEntry[]
    injects: InjectEntry[]
    components: GraphComponent[]
}

export interface ProvideEntry {
    key: string
    componentName: string
    scope: 'global' | 'layout' | 'component'
    shadowed: boolean
    value: unknown
}

export interface InjectEntry {
    key: string
    componentName: string
    resolved: boolean
    providerChain?: string[]
}

export interface GraphComponent {
    name: string
    status: 'normal' | 'missing-provider' | 'shadowed'
}

export interface TransitionEntry {
    name: string
    phase: TransitionPhase
    duration: number
    timestamp: number
    parentComponent: string
    cancelled: boolean
    error?: string
}

export type TransitionPhase = 'entering' | 'entered' | 'leaving' | 'left' | 'enter-cancelled' | 'leave-cancelled'

export interface PiniaStateDiff {
    path: string
    before: unknown
    after: unknown
}

export interface PiniaDependency {
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

export interface PiniaTimelineEvent {
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
    dependencies: PiniaDependency[]
    timeline: PiniaTimelineEvent[]
    hydrationTimeline: PiniaHydrationEvent[]
    lastMutationAt?: number
    lastActionAt?: number
    hydration?: PiniaHydrationEvent
}

export interface InternalCounts {
    componentMounts: Record<string, number>
    renderOperations: Record<string, number>
    fetchOperations: Record<string, FetchOperationCount>
}

export interface FetchOperationCount {
    count: number
    totalDuration: number
}

export interface ObservatoryTestAPI {
    getTraces(): Promise<TraceEntry[]>
    getHeatmapData(): Promise<HeatmapData>
    getComposableEntries(): Promise<ComposableEntry[]>
    getFetchEntries(): Promise<FetchEntry[]>
    getProvideInjectGraph(): Promise<GraphData>
    getTransitionEntries(): Promise<TransitionEntry[]>
    getPiniaStores(): Promise<PiniaStoreEntry[]>
    getInternalCounts(): Promise<InternalCounts>
    clearAllData(): Promise<void>
    startRecording(): Promise<void>
    stopRecording(): Promise<void>
    exportSnapshot(): Promise<string>
}

export interface ExtendedHTMLElement extends HTMLElement {
    __observatoryMountCount?: number
}

export interface TestWindow extends Window {
    __OBSERVATORY_TEST_BRIDGE?: ObservatoryTestAPI
    __lastMountStart?: number
    __heavyRenderStart?: number
    __editableComponentCounter?: number
}

// Type guard functions
export function isTestWindow(window: Window): window is TestWindow {
    return window !== undefined
}

export function hasTestBridge(window: Window): window is TestWindow {
    return isTestWindow(window) && window.__OBSERVATORY_TEST_BRIDGE !== undefined
}
