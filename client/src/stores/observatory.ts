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

export interface ProvideInjectSnapshot {
    provides: ProvideEntry[]
    injects: InjectEntry[]
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
// parentOrigin is only used for the outgoing postMessage target. We always
// validate incoming messages strictly — see onMessage below.
let parentOrigin = '*'
let pollIntervalId: number | null = null

function cloneArray<T>(value: T[] | undefined): T[] {
    return value ? value.map((item) => ({ ...item })) : []
}

function normalizeRenderEntries(value: RenderEntry[] | undefined): RenderEntry[] {
    return value
        ? value.map((item) => ({
              ...item,
          }))
        : []
}

function getParentOrigin(): string {
    if (typeof document === 'undefined') return ''
    // Prefer the opener/embedder origin from document.referrer.
    if (document.referrer) {
        try {
            return new URL(document.referrer).origin
        } catch {
            /* fall through */
        }
    }
    // When opened as a top-level window (e.g. direct navigation) there is no
    // referrer and no parent to receive messages from — return empty string so
    // we never send to or accept from '*'.
    return ''
}

function requestSnapshot() {
    if (!parentOrigin) return
    window.top?.postMessage({ type: 'observatory:request' }, parentOrigin)
}

function onMessage(event: MessageEvent) {
    if (event.data?.type !== 'observatory:snapshot') {
        return
    }

    // Always validate the origin of incoming snapshot messages.
    // Accepting '*' would allow any page to inject arbitrary devtools data.
    // For local screenshots/dev, allow any origin if parentOrigin is empty (SPA running standalone)
    if (parentOrigin && event.origin !== parentOrigin) {
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
    pollIntervalId = window.setInterval(requestSnapshot, POLL_MS)
    requestSnapshot()
}

/**
 * Stops polling and removes the message listener.
 * Call this when tearing down the SPA (e.g. in an onUnmounted hook at the
 * root component level) to prevent the interval from running indefinitely.
 */
export function stopObservatoryPolling() {
    if (pollIntervalId !== null) {
        window.clearInterval(pollIntervalId)
        pollIntervalId = null
    }
    window.removeEventListener('message', onMessage)
    started = false
}

export function getObservatoryOrigin() {
    return parentOrigin
}

export function clearComposables() {
    composables.value = []
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
        clearComposables,
    }
}
