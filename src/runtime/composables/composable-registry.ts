import { ref, isRef, isReadonly, unref, getCurrentInstance, onUnmounted } from 'vue'

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

interface RuntimeEffect {
    active: boolean
    stop?: () => void
}

interface TrackedInstance {
    uid?: number
    scope?: { effects?: RuntimeEffect[] }
    bm?: unknown[]
    um?: unknown[]
}

/**
 * Registers a new composable entry, updates an existing one, or retrieves all entries.
 * @remarks The returned object exposes the following methods:
 * - `register`: Registers a new composable entry.
 * - `update`: Updates an existing composable entry.
 * - `getAll`: Retrieves all composable entries.
 * @returns {{ register: (entry: ComposableEntry) => void, update: (id: string, patch: Partial<ComposableEntry>) => void, getAll: () => ComposableEntry[] }} An object with `register`, `update`, and `getAll` methods.
 */
export function setupComposableRegistry() {
    const entries = ref<Map<string, ComposableEntry>>(new Map())

    function register(entry: ComposableEntry) {
        entries.value.set(entry.id, entry)
        emit('composable:register', entry)
    }

    function update(id: string, patch: Partial<ComposableEntry>) {
        const existing = entries.value.get(id)

        if (!existing) {
            return
        }

        const updated = { ...existing, ...patch }
        entries.value.set(id, updated)
        emit('composable:update', updated)
    }

    function safeValue(val: unknown): unknown {
        if (val === undefined || val === null) {
            return val
        }

        if (typeof val === 'function') {
            return undefined
        }

        if (typeof val === 'object') {
            try {
                return JSON.parse(JSON.stringify(val))
            } catch {
                return String(val)
            }
        }

        return val
    }

    function sanitize(entry: ComposableEntry): ComposableEntry {
        return {
            id: entry.id,
            name: entry.name,
            componentFile: entry.componentFile,
            componentUid: entry.componentUid,
            status: entry.status,
            leak: entry.leak,
            leakReason: entry.leakReason,
            refs: Object.fromEntries(
                Object.entries(entry.refs).map(([k, v]) => [
                    k,
                    {
                        type: v.type,
                        value: safeValue(typeof v.value === 'object' && v.value !== null && 'value' in v.value ? v.value.value : v.value),
                    },
                ])
            ),
            watcherCount: entry.watcherCount,
            intervalCount: entry.intervalCount,
            lifecycle: entry.lifecycle,
            file: entry.file,
            line: entry.line,
        }
    }
    function getAll(): ComposableEntry[] {
        return [...entries.value.values()].map(sanitize)
    }

    function emit(event: string, data: unknown) {
        if (!import.meta.client) {
            return
        }

        const channel = (window as Window & { __nuxt_devtools__?: { channel?: { send: (event: string, data: unknown) => void } } })
            .__nuxt_devtools__?.channel
        channel?.send(event, data)
    }

    return { register, update, getAll }
}

// ── Dev shim called by Vite transform ─────────────────────────────────────

export function __trackComposable<T>(name: string, callFn: () => T, meta: { file: string; line: number }): T {
    if (!import.meta.dev) {
        return callFn()
    }

    if (!import.meta.client) {
        return callFn()
    }

    const registry = (window as Window & { __observatory__?: { composable?: ReturnType<typeof setupComposableRegistry> } }).__observatory__
        ?.composable

    if (!registry) {
        return callFn()
    }

    const instance = getCurrentInstance() as TrackedInstance | null
    const id = `${name}::${instance?.uid ?? 'global'}::${meta.file}:${meta.line}::${Date.now()}`

    // Track intervals registered during setup
    const trackedIntervals: number[] = []
    const originalSetInterval = window.setInterval
    const originalClearInterval = window.clearInterval
    const clearedIntervals = new Set<number>()

    window.setInterval = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) => {
        const id = originalSetInterval(fn, ms, ...rest)
        trackedIntervals.push(id as number)

        return id
    }) as typeof window.setInterval

    window.clearInterval = ((id?: number) => {
        if (id !== undefined) {
            clearedIntervals.add(id)
        }

        originalClearInterval(id)
    }) as typeof window.clearInterval

    const effectsBefore = new Set(instance?.scope?.effects ?? [])
    const mountedHooksBefore = instance?.bm?.length ?? 0
    const unmountedHooksBefore = instance?.um?.length ?? 0

    const result = callFn()

    // Restore globals immediately after setup
    window.setInterval = originalSetInterval
    window.clearInterval = originalClearInterval

    const trackedWatchers = (instance?.scope?.effects ?? [])
        .filter((effect) => !effectsBefore.has(effect))
        .map((effect) => ({
            effect,
            stop: () => effect.stop?.(),
        }))

    // Snapshot reactive return values
    const refs: ComposableEntry['refs'] = {}

    if (result && typeof result === 'object') {
        for (const [key, val] of Object.entries(result as object)) {
            if (isRef(val)) {
                refs[key] = {
                    type: isReadonly(val) ? 'computed' : 'ref',
                    value: safeSnapshot(unref(val)),
                }
            }
        }
    }

    const entry: ComposableEntry = {
        id,
        name,
        componentFile: meta.file,
        componentUid: instance?.uid ?? -1,
        status: 'mounted',
        leak: false,
        refs,
        watcherCount: trackedWatchers.length,
        intervalCount: trackedIntervals.length,
        lifecycle: {
            hasOnMounted: (instance?.bm?.length ?? 0) > mountedHooksBefore,
            hasOnUnmounted: (instance?.um?.length ?? 0) > unmountedHooksBefore,
            watchersCleaned: true,
            intervalsCleaned: true,
        },
        file: meta.file,
        line: meta.line,
    }

    registry.register(entry)

    // Detect leaks on unmount
    onUnmounted(() => {
        const leakedWatchers = trackedWatchers.filter((w) => w.effect.active)
        const leakedIntervals = trackedIntervals.filter((id) => !clearedIntervals.has(id))

        const leak = leakedWatchers.length > 0 || leakedIntervals.length > 0
        const reasons: string[] = []

        if (leakedWatchers.length > 0) {
            reasons.push(`${leakedWatchers.length} watcher${leakedWatchers.length > 1 ? 's' : ''} still active after unmount`)
        }

        if (leakedIntervals.length > 0) {
            reasons.push(`setInterval #${leakedIntervals.join(', #')} never cleared`)
        }

        registry.update(id, {
            status: 'unmounted',
            leak,
            leakReason: reasons.join(' · ') || undefined,
            lifecycle: {
                ...entry.lifecycle,
                watchersCleaned: leakedWatchers.length === 0,
                intervalsCleaned: leakedIntervals.length === 0,
            },
        })
    })

    return result
}

/**
 * Safely snapshots a value to a string representation.
 * @param {unknown} value - The value to snapshot
 * @returns {unknown} A serializable snapshot of the value
 */
function safeSnapshot(value: unknown): unknown {
    try {
        if (value === null || value === undefined) {
            return value
        }

        if (typeof value === 'function') {
            return '[Function]'
        }

        if (Array.isArray(value)) {
            return `Array(${value.length})`
        }

        if (typeof value === 'object') {
            const str = JSON.stringify(value)

            return str.length > 120 ? str.slice(0, 120) + '…' : JSON.parse(str)
        }

        return value
    } catch {
        return '[unserializable]'
    }
}
