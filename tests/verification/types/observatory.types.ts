// Complete type definitions for Observatory data structures - NO unused exports

export interface ITraceEntry {
    id: string
    route: string
    startTime: number
    endTime: number
    spans: ISpan[]
    metadata: Record<string, unknown>
}

export interface ISpan {
    id: string
    parentId?: string
    type: TSpanType
    name: string
    startTime: number
    endTime: number
    duration: number
    metadata: Record<string, unknown>
}

export type TSpanType = 'navigation' | 'component' | 'render' | 'fetch' | 'server' | 'composable' | 'transition'

export interface IHeatmapData {
    components: Record<string, IComponentHeatmapData>
}

export interface IComponentHeatmapData {
    totalRenders: number
    totalDuration: number
    byRoute: Record<string, IRouteHeatmapData>
    timeline: ITimelineEvent[]
}

export interface IRouteHeatmapData {
    renders: number
    duration: number
}

export interface ITimelineEvent {
    timestamp: number
    type: 'mount' | 'update'
    duration: number
    route: string
    triggerKey?: string
}

export interface IComposableEntry {
    name: string
    id: string
    status: TComposableStatus
    state: Record<string, IComposableStateValue>
    history: IHistoryEvent[]
    leaks?: ILeakInfo
}

export type TComposableStatus = 'active' | 'unmounted' | 'leaked'

export interface IComposableStateValue {
    value: unknown
    global: boolean
    type: 'ref' | 'computed' | 'reactive'
}

export interface IHistoryEvent {
    key: string
    value: unknown
    timestamp: number
}

export interface ILeakInfo {
    watchers: number
    intervals: number
}

export interface IFetchEntry {
    key: string
    url: string
    status: TFetchStatus
    duration: number
    origin: 'ssr' | 'csr'
    startOffset: number
    cacheKey?: string
}

export type TFetchStatus = 'pending' | 'success' | 'error'

export interface IGraphData {
    provides: IProvideEntry[]
    injects: IInjectEntry[]
    components: IGraphComponent[]
}

export interface IProvideEntry {
    key: string
    componentName: string
    scope: 'global' | 'layout' | 'component'
    shadowed: boolean
    value: unknown
}

export interface IInjectEntry {
    key: string
    componentName: string
    resolved: boolean
    providerChain?: string[]
}

export interface IGraphComponent {
    name: string
    status: 'normal' | 'missing-provider' | 'shadowed'
}

export interface ITransitionEntry {
    name: string
    phase: TTransitionPhase
    duration: number
    timestamp: number
    parentComponent: string
    cancelled: boolean
    error?: string
}

export type TTransitionPhase = 'entering' | 'entered' | 'leaving' | 'left' | 'enter-cancelled' | 'leave-cancelled'

export interface IPiniaStateDiff {
    path: string
    before: unknown
    after: unknown
}

export interface IPiniaDependency {
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

export interface IPiniaTimelineEvent {
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
    dependencies: IPiniaDependency[]
    timeline: IPiniaTimelineEvent[]
    hydrationTimeline: IPiniaHydrationEvent[]
    lastMutationAt?: number
    lastActionAt?: number
    hydration?: IPiniaHydrationEvent
}

export interface IInternalCounts {
    componentMounts: Record<string, number>
    renderOperations: Record<string, number>
    fetchOperations: Record<string, IFetchOperationCount>
}

export interface IFetchOperationCount {
    count: number
    totalDuration: number
}

export interface IObservatoryTestAPI {
    getTraces(): Promise<ITraceEntry[]>
    getHeatmapData(): Promise<IHeatmapData>
    getComposableEntries(): Promise<IComposableEntry[]>
    getFetchEntries(): Promise<IFetchEntry[]>
    getProvideInjectGraph(): Promise<IGraphData>
    getTransitionEntries(): Promise<ITransitionEntry[]>
    getPiniaStores(): Promise<IPiniaStoreEntry[]>
    getInternalCounts(): Promise<IInternalCounts>
    clearAllData(): Promise<void>
    startRecording(): Promise<void>
    stopRecording(): Promise<void>
    exportSnapshot(): Promise<string>
}

export interface IExtendedHTMLElement extends HTMLElement {
    __observatoryMountCount?: number
}

export interface ITestWindow extends Window {
    __OBSERVATORY_TEST_BRIDGE?: IObservatoryTestAPI
    __lastMountStart?: number
    __heavyRenderStart?: number
    __editableComponentCounter?: number
}

// Type guard functions
export function isTestWindow(window: Window): window is ITestWindow {
    return window !== undefined
}

export function hasTestBridge(window: Window): window is ITestWindow {
    return isTestWindow(window) && window.__OBSERVATORY_TEST_BRIDGE !== undefined
}
