import { ref } from 'vue'

const POLL_MS = 500

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

export interface ProvideInjectSnapshot {
    provides: ProvideEntry[]
    injects: InjectEntry[]
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
}

export interface RenderEntry {
    uid: number
    name: string
    file: string
    element?: string
    renders: number
    navigationRenders: number
    totalMs: number
    avgMs: number
    triggers: Array<{ key: string; type: string; timestamp: number }>
    rect?: { x: number; y: number; width: number; height: number; top: number; left: number }
    children: number[]
    parentUid?: number
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

interface ObservatorySnapshot {
    fetch?: FetchEntry[]
    provideInject?: ProvideInjectSnapshot
    composables?: ComposableEntry[]
    renders?: RenderEntry[]
    transitions?: TransitionEntry[]
}

const fetchEntries = ref<FetchEntry[]>([])
const provideInject = ref<ProvideInjectSnapshot>({ provides: [], injects: [] })
const composables = ref<ComposableEntry[]>([])
const renders = ref<RenderEntry[]>([])
const transitions = ref<TransitionEntry[]>([])
const connected = ref(false)

let started = false
let parentOrigin = '*'

function cloneArray<T>(value: T[] | undefined): T[] {
    return value ? value.map((item) => ({ ...item })) : []
}

function normalizeRenderEntries(value: RenderEntry[] | undefined): RenderEntry[] {
    return value
        ? value.map((item) => ({
              ...item,
              navigationRenders: Number.isFinite(item.navigationRenders) ? item.navigationRenders : 0,
          }))
        : []
}

function getParentOrigin() {
    if (typeof document === 'undefined' || !document.referrer) {
        return '*'
    }

    try {
        return new URL(document.referrer).origin
    } catch {
        return '*'
    }
}

function requestSnapshot() {
    window.top?.postMessage({ type: 'observatory:request' }, parentOrigin)
}

function onMessage(event: MessageEvent) {
    if (event.data?.type !== 'observatory:snapshot') {
        return
    }

    if (parentOrigin !== '*' && event.origin !== parentOrigin) {
        return
    }

    const data = event.data.data as ObservatorySnapshot
    fetchEntries.value = cloneArray(data.fetch)
    provideInject.value = data.provideInject
        ? {
              provides: cloneArray(data.provideInject.provides),
              injects: cloneArray(data.provideInject.injects),
          }
        : { provides: [], injects: [] }
    composables.value = cloneArray(data.composables)
    renders.value = normalizeRenderEntries(data.renders)
    transitions.value = cloneArray(data.transitions)
    connected.value = true
}

function ensureStarted() {
    if (started || typeof window === 'undefined') {
        return
    }

    started = true
    parentOrigin = getParentOrigin()
    window.addEventListener('message', onMessage)
    window.setInterval(requestSnapshot, POLL_MS)
    requestSnapshot()
}

export function useObservatoryData() {
    ensureStarted()

    return {
        fetch: fetchEntries,
        provideInject,
        composables,
        renders,
        transitions,
        connected,
        refresh: requestSnapshot,
    }
}
