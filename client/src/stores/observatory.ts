import { ref } from 'vue'
import { useDevtoolsClient, onDevtoolsClientConnected } from '@nuxt/devtools-kit/iframe-client'
import type { IObservatorySnapshot, IObservatoryServerFunctions, IObservatoryClientFunctions } from '@observatory/types/rpc'
import type {
    IFetchEntry,
    IProvideEntry,
    IInjectEntry,
    IComposableEntry,
    IPiniaStoreEntry,
    IRenderEntry,
    ITransitionEntry,
    ITraceEntry,
    IPayloadInspectorSnapshot,
    IStateCookieEntry,
    IKeepAliveSnapshot,
} from '@observatory/types/snapshot'

type TProvideInjectSnapshot = { provides: IProvideEntry[]; injects: IInjectEntry[] }

const fetchEntries = ref<IFetchEntry[]>([])
const provideInject = ref<TProvideInjectSnapshot>({ provides: [], injects: [] })
const composables = ref<IComposableEntry[]>([])
const piniaStores = ref<IPiniaStoreEntry[]>([])
const renders = ref<IRenderEntry[]>([])
const transitions = ref<ITransitionEntry[]>([])
const traces = ref<ITraceEntry[]>([])
const emptyPayload: IPayloadInspectorSnapshot = {
    capturedAt: 0,
    isHydrating: false,
    serverRendered: false,
    keyCount: 0,
    totalBytes: 0,
    keys: [],
}
const payload = ref<IPayloadInspectorSnapshot>({ ...emptyPayload })
const stateCookies = ref<IStateCookieEntry[]>([])
const emptyKeepAlive: IKeepAliveSnapshot = { events: [], cache: [] }
const keepAlive = ref<IKeepAliveSnapshot>({ ...emptyKeepAlive, events: [], cache: [] })
const connected = ref(false)
const features = ref<IObservatorySnapshot['features']>({})
const debugRpc = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debugRpc')

let started = false
let rpc: IObservatoryServerFunctions | null = null
let loggedFirstSnapshot = false
let queuedMode: 'route' | 'session' | null = null
let desiredMode: 'route' | 'session' | null = null

function debugLog(...args: unknown[]) {
    if (debugRpc) {
        // eslint-disable-next-line no-console
        console.info('[observatory][rpc][iframe]', ...args)
    }
}

function cloneArray<T>(value: T[] | undefined): T[] {
    return value ? value.map((item) => ({ ...item })) : []
}

function normalizeRenderEntries(value: IRenderEntry[] | undefined): IRenderEntry[] {
    return value
        ? value.map((item) => ({
              ...item,
          }))
        : []
}

function applySnapshot(data: IObservatorySnapshot) {
    fetchEntries.value = cloneArray(data.fetch as IFetchEntry[] | undefined)
    provideInject.value = data.provideInject
        ? {
              provides: cloneArray(data.provideInject.provides as TProvideInjectSnapshot['provides']),
              injects: cloneArray(data.provideInject.injects as TProvideInjectSnapshot['injects']),
          }
        : { provides: [], injects: [] }
    composables.value = cloneArray(data.composables as IComposableEntry[] | undefined)
    piniaStores.value = cloneArray(data.piniaStores as IPiniaStoreEntry[] | undefined)
    renders.value = normalizeRenderEntries(data.renders as IRenderEntry[] | undefined)
    transitions.value = cloneArray(data.transitions as ITransitionEntry[] | undefined)
    traces.value = cloneArray(data.traces as ITraceEntry[] | undefined)
    const nextPayload = data.payload as IPayloadInspectorSnapshot | undefined
    payload.value = nextPayload
        ? {
              capturedAt: nextPayload.capturedAt ?? 0,
              isHydrating: !!nextPayload.isHydrating,
              serverRendered: !!nextPayload.serverRendered,
              keyCount: nextPayload.keyCount ?? nextPayload.keys?.length ?? 0,
              totalBytes: nextPayload.totalBytes ?? 0,
              keys: cloneArray(nextPayload.keys),
          }
        : { ...emptyPayload, keys: [] }
    stateCookies.value = cloneArray(data.stateCookies as IStateCookieEntry[] | undefined)
    const nextKeepAlive = data.keepAlive as IKeepAliveSnapshot | undefined
    keepAlive.value = nextKeepAlive
        ? {
              events: cloneArray(nextKeepAlive.events),
              cache: cloneArray(nextKeepAlive.cache),
          }
        : { events: [], cache: [] }
    features.value = data.features || {}

    // If the server snapshot disagrees with the user's requested mode,
    // keep trying to reconcile so mode doesn't silently snap back.
    const snapshotMode = features.value?.composableNavigationMode

    if (desiredMode && snapshotMode !== desiredMode) {
        features.value = { ...(features.value || {}), composableNavigationMode: desiredMode }

        rpc?.setComposableMode(desiredMode)
            .then(() => rpc?.requestSnapshot())
            .catch((error) => {
                debugLog('setComposableMode reconcile failed', error)
            })
    }

    if (desiredMode && snapshotMode === desiredMode) {
        desiredMode = null
    }

    connected.value = true

    if (!loggedFirstSnapshot) {
        loggedFirstSnapshot = true
        debugLog('first snapshot received', {
            fetch: fetchEntries.value.length,
            composables: composables.value.length,
            piniaStores: piniaStores.value.length,
            renders: renders.value.length,
            transitions: transitions.value.length,
            traces: traces.value.length,
        })
    }
}

function ensureStarted() {
    if (started) {
        return
    }

    started = true

    // Support mock data injection via postMessage (used by the screenshot capture script).
    if (typeof window !== 'undefined') {
        window.addEventListener('message', (event: MessageEvent) => {
            if (event.origin !== window.location.origin) {
                return
            }

            if (event.data?.type === 'observatory:snapshot') {
                applySnapshot(event.data.data)
            }
        })
    }

    const client = useDevtoolsClient()

    const setupRpc = () => {
        if (!client.value || rpc) {
            return
        }

        rpc = client.value.devtools.extendClientRpc<IObservatoryServerFunctions, IObservatoryClientFunctions>('observatory', {
            onSnapshot(snapshot) {
                applySnapshot(snapshot)
            },
        })

        debugLog('RPC connected')

        if (queuedMode) {
            const mode = queuedMode
            queuedMode = null
            rpc.setComposableMode(mode).catch((error) => {
                debugLog('setComposableMode failed (queued)', error)
            })
        }

        rpc.getSnapshot()
            .then((snapshot) => {
                if (snapshot) {
                    applySnapshot(snapshot)
                }
            })
            .catch(() => {
                // Keep the UI usable while the host app is reloading.
            })

        rpc.requestSnapshot().catch(() => {
            // Host app may still be initializing; a later push will update the UI.
        })
    }

    setupRpc()
    onDevtoolsClientConnected(() => {
        setupRpc()
    })
}

/**
 * Kept as a no-op for backwards compatibility.
 */
export function stopObservatoryPolling() {
    // No polling to stop after birpc migration.
}

export function getObservatoryOrigin() {
    return window.location.origin
}

export function clearComposables() {
    composables.value = []
    rpc?.clearComposables()
        .then(() => rpc?.requestSnapshot())
        .catch((error) => {
            debugLog('clearComposables failed', error)
        })
}

export function setComposableMode(mode: 'route' | 'session') {
    desiredMode = mode

    // Keep UI responsive even when RPC is still initializing.
    features.value = { ...(features.value || {}), composableNavigationMode: mode }

    if (!rpc) {
        queuedMode = mode
        debugLog('setComposableMode queued', mode)

        return
    }

    rpc.setComposableMode(mode)
        .then(() => rpc?.requestSnapshot())
        .catch((error) => {
            debugLog('setComposableMode failed', error)
        })
}

export function editComposableValue(id: string, key: string, value: unknown) {
    rpc?.editComposableValue(id, key, value).catch((error) => {
        debugLog('editComposableValue failed', error)
    })
}

export function clearPiniaStores() {
    piniaStores.value = []
    rpc?.clearPiniaStores()
        .then(() => rpc?.requestSnapshot())
        .catch((error) => {
            debugLog('clearPiniaStores failed', error)
        })
}

export function editPiniaState(storeId: string, path: string, value: unknown) {
    rpc?.editPiniaState(storeId, path, value).catch((error) => {
        debugLog('editPiniaState failed', error)
    })
}

export function openInEditor(file: string) {
    if (!file || file === 'unknown') {
        return
    }

    // Uses the built-in Nuxt DevTools RPC when available.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const devtoolsRpc = (useDevtoolsClient().value?.devtools as any)?.rpc

    if (devtoolsRpc?.openInEditor) {
        devtoolsRpc.openInEditor(file)
    }
}

export function useObservatoryData() {
    ensureStarted()

    const refresh = () => {
        rpc?.getSnapshot()
            .then((snapshot) => {
                if (snapshot) {
                    applySnapshot(snapshot)
                }
            })
            .catch(() => {})

        rpc?.requestSnapshot().catch(() => {})
    }

    return {
        fetch: fetchEntries,
        provideInject,
        composables,
        piniaStores,
        renders,
        transitions,
        traces,
        payload,
        stateCookies,
        keepAlive,
        features,
        connected,
        refresh,
        clearComposables,
    }
}
