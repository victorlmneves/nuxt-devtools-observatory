import { onUnmounted, ref } from 'vue'

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
    renders: number
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

export interface FetchEntry {
    id: string
    key: string
    url: string
    status: 'pending' | 'ok' | 'error' | 'cached'
    origin: 'ssr' | 'csr'
    ms?: number
    size?: number
    cached: boolean
    payload?: unknown
    file?: string
    line?: number
    startOffset?: number
}

interface ComposableEntry {
    id: string
    name: string
    component: string
    instances: number
    status: 'mounted' | 'unmounted'
    leak: boolean
    leakReason?: string
    refs: Array<{ key: string; type: string; val: string }>
    watchers: number
    intervals: number
    lifecycle: { onMounted: boolean; onUnmounted: boolean; watchersCleaned: boolean; intervalsCleaned: boolean }
}

interface ProvideInjectNode {
    id: string
    label: string
    type: 'provider' | 'consumer' | 'both' | 'error'
    provides: Array<{ key: string; val: string; reactive: boolean }>
    injects: Array<{ key: string; from: string | null; ok: boolean }>
    children: ProvideInjectNode[]
}

interface RenderNode {
    id: string
    label: string
    file: string
    renders: number
    avgMs: number
    triggers: string[]
    children: RenderNode[]
}

interface ObservatorySnapshot {
    fetch?: FetchEntry[]
    provideInject?: ProvideInjectSnapshot
    composables?: ComposableEntry[]
    renders?: RenderEntry[]
    transitions?: TransitionEntry[]
    fetch?: FetchEntry[]
    composables?: ComposableEntry[]
    provideInject?: ProvideInjectNode[]
    renders?: RenderNode[]
}

const fetchEntries = ref<FetchEntry[]>([])
const provideInject = ref<ProvideInjectSnapshot>({ provides: [], injects: [] })
const composables = ref<ComposableEntry[]>([])
const renders = ref<RenderEntry[]>([])
const transitions = ref<TransitionEntry[]>([])
const connected = ref(false)

let started = false
let timer: ReturnType<typeof setInterval> | null = null
let cleanupRegistered = false
let parentOrigin = '*'

function cloneArray<T>(value: T[] | undefined): T[] {
    return value ? value.map((item) => ({ ...item })) : []
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
    renders.value = cloneArray(data.renders)
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
    timer = window.setInterval(requestSnapshot, POLL_MS)
    requestSnapshot()
}

export function useObservatoryData() {
    ensureStarted()

    if (!cleanupRegistered) {
        cleanupRegistered = true
        onUnmounted(() => {
            if (!started) {
                return
            }

            window.removeEventListener('message', onMessage)

            if (timer) {
                clearInterval(timer)
                timer = null
            }

            started = false
            cleanupRegistered = false
        })
    }

    return {
        fetch: fetchEntries,
        provideInject,
        composables,
        renders,
        transitions,
        connected,
    }
}
