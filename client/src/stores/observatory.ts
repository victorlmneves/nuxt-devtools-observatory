import { ref } from 'vue'
import { useDevtoolsClient, onDevtoolsClientConnected } from '@nuxt/devtools-kit/iframe-client'
import type { ObservatorySnapshot, ObservatoryServerFunctions, ObservatoryClientFunctions } from '../../../src/types/rpc'
import type { FetchEntry, ProvideEntry, InjectEntry, ComposableEntry, RenderEntry, TransitionEntry } from '../../../src/types/snapshot'

type ProvideInjectSnapshot = { provides: ProvideEntry[]; injects: InjectEntry[] }

const fetchEntries = ref<FetchEntry[]>([])
const provideInject = ref<ProvideInjectSnapshot>({ provides: [], injects: [] })
const composables = ref<ComposableEntry[]>([])
const renders = ref<RenderEntry[]>([])
const transitions = ref<TransitionEntry[]>([])
const connected = ref(false)
const features = ref<ObservatorySnapshot['features']>({})
const debugRpc = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debugRpc')

let started = false
let rpc: ObservatoryServerFunctions | null = null
let loggedFirstSnapshot = false

function debugLog(...args: unknown[]) {
    if (debugRpc) {
        // eslint-disable-next-line no-console
        console.info('[observatory][rpc][iframe]', ...args)
    }
}

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

function applySnapshot(data: ObservatorySnapshot) {
    fetchEntries.value = cloneArray(data.fetch as FetchEntry[] | undefined)
    provideInject.value = data.provideInject
        ? {
              provides: cloneArray(data.provideInject.provides as ProvideInjectSnapshot['provides']),
              injects: cloneArray(data.provideInject.injects as ProvideInjectSnapshot['injects']),
          }
        : { provides: [], injects: [] }
    composables.value = cloneArray(data.composables as ComposableEntry[] | undefined)
    renders.value = normalizeRenderEntries(data.renders as RenderEntry[] | undefined)
    transitions.value = cloneArray(data.transitions as TransitionEntry[] | undefined)
    features.value = data.features || {}
    connected.value = true

    if (!loggedFirstSnapshot) {
        loggedFirstSnapshot = true
        debugLog('first snapshot received', {
            fetch: fetchEntries.value.length,
            composables: composables.value.length,
            renders: renders.value.length,
            transitions: transitions.value.length,
        })
    }
}

function ensureStarted() {
    if (started) {
        return
    }

    started = true
    const client = useDevtoolsClient()

    const setupRpc = () => {
        if (!client.value || rpc) {
            return
        }

        rpc = client.value.devtools.extendClientRpc<ObservatoryServerFunctions, ObservatoryClientFunctions>('observatory', {
            onSnapshot(snapshot) {
                applySnapshot(snapshot)
            },
        })

        debugLog('RPC connected')

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
    rpc?.clearComposables().catch(() => {})
}

export function setComposableMode(mode: 'route' | 'session') {
    rpc?.setComposableMode(mode).catch(() => {})
}

export function editComposableValue(id: string, key: string, value: unknown) {
    rpc?.editComposableValue(id, key, value).catch(() => {})
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
        renders,
        transitions,
        features,
        connected,
        refresh,
        clearComposables,
    }
}
