import { ref, isRef, isReactive, isReadonly, unref, computed, watchEffect, getCurrentInstance, onUnmounted } from 'vue'

export interface RefChangeEvent {
    t: number // performance.now() timestamp
    key: string // which ref/reactive key changed
    value: unknown // serialised snapshot of the new value
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
    /** Capped at MAX_HISTORY_PER_ENTRY events, newest last */
    history: RefChangeEvent[]
    /**
     * Keys whose underlying ref/reactive object is shared across multiple
     * instances of this composable — indicates module-level (global) state.
     */
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
    /** Route path the composable was registered on, e.g. "/products". */
    route: string
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
    // Stores live Ref/computed objects keyed by entry id so getAll() can
    // re-read current values on every snapshot rather than serving the
    // stale copy captured at setup time.
    const liveRefs = new Map<string, Record<string, import('vue').Ref<unknown>>>()
    // Stop functions for watchEffect instances tracking each composable's live refs
    const liveRefWatchers = new Map<string, () => void>()
    // Per-entry change history: id → array of RefChangeEvent (capped at MAX_HISTORY)
    const MAX_HISTORY = 50
    const entryHistory = new Map<string, RefChangeEvent[]>()
    // Previous serialised values per ref, used to detect which key actually changed
    const prevValues = new Map<string, Record<string, string>>()
    // Raw (unwrapped) objects per entry — used to detect shared/global state by
    // comparing object identity across instances of the same composable name.
    const rawRefs = new Map<string, Record<string, unknown>>()

    /**
     * For a given entry, return the set of ref keys whose underlying object is
     * shared with at least one other live instance of the same composable.
     * Two instances share a ref when they return the exact same object reference.
     */
    function computeSharedKeys(id: string, name: string): string[] {
        const ownRaw = rawRefs.get(id)
        if (!ownRaw) return []

        const shared = new Set<string>()
        for (const [otherId, entry] of entries.value.entries()) {
            if (otherId === id || entry.name !== name) continue
            const otherRaw = rawRefs.get(otherId)
            if (!otherRaw) continue
            for (const [key, obj] of Object.entries(ownRaw)) {
                if (key in otherRaw && otherRaw[key] === obj) {
                    shared.add(key)
                }
            }
        }
        return [...shared]
    }
    // The current route path — updated by the plugin on every navigation so new
    // entries are stamped with the route they were created on.
    let currentRoute = '/'

    function setRoute(path: string) {
        currentRoute = path
    }

    function getRoute(): string {
        return currentRoute
    }

    function register(entry: ComposableEntry) {
        entries.value.set(entry.id, entry)
        emit('composable:register', entry)
    }

    function registerLiveRefs(id: string, refs: Record<string, import('vue').Ref<unknown>>) {
        // Stop any previous watcher for this entry before replacing refs
        const prevStop = liveRefWatchers.get(id)
        if (prevStop) prevStop()
        liveRefWatchers.delete(id)

        if (Object.keys(refs).length === 0) {
            // No live refs — remove the entry entirely so sanitize() falls back
            // to the frozen snapshot stored in entry.refs (e.g. after unmount).
            liveRefs.delete(id)
            rawRefs.delete(id)
            prevValues.delete(id)
            return
        }

        liveRefs.set(id, refs)
        // Initialise the previous-value map so the first run doesn't log everything as "changed"
        prevValues.set(
            id,
            Object.fromEntries(
                Object.entries(refs).map(([k, r]) => {
                    try {
                        return [k, JSON.stringify(unref(r)) ?? '']
                    } catch {
                        return [k, '']
                    }
                })
            )
        )

        const stop = watchEffect(() => {
            // Read every ref to subscribe — the effect re-runs when any changes.
            // Compare against previous values to record which key(s) changed.
            const prev = prevValues.get(id) ?? {}
            const now: Record<string, string> = {}
            const t = typeof performance !== 'undefined' ? performance.now() : Date.now()

            for (const [k, r] of Object.entries(refs)) {
                const val = unref(r)
                const serialised = JSON.stringify(val) ?? ''
                now[k] = serialised

                if (serialised !== prev[k]) {
                    // This key changed — append a history event
                    const history = entryHistory.get(id) ?? []
                    history.push({ t, key: k, value: safeValue(val) })
                    if (history.length > MAX_HISTORY) history.shift()
                    entryHistory.set(id, history)
                }
            }

            prevValues.set(id, now)
            _onChange?.()
        })
        liveRefWatchers.set(id, stop)
    }

    function registerRawRefs(id: string, refs: Record<string, unknown>) {
        rawRefs.set(id, refs)
    }

    // Callback invoked by the plugin whenever live ref values change.
    // The plugin sets this after mounting so it can trigger a postMessage push.
    let _onChange: (() => void) | null = null
    function onComposableChange(cb: () => void) {
        _onChange = cb
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
        // Re-read live ref values on every snapshot so the devtools panel
        // reflects the current reactive state rather than setup-time values.
        // live is null/undefined after unmount (liveRefs.delete was called),
        // at which point we fall back to the frozen snapshot in entry.refs.
        const live = liveRefs.get(entry.id)
        const hasLive = live != null && Object.keys(live).length > 0
        const freshRefs = hasLive
            ? Object.fromEntries(
                  Object.entries(live!).map(([k, r]) => [
                      k,
                      {
                          type: entry.refs[k]?.type ?? 'ref',
                          value: safeValue(unref(r)),
                      },
                  ])
              )
            : Object.fromEntries(
                  Object.entries(entry.refs).map(([k, v]) => [
                      k,
                      {
                          type: v.type,
                          value: safeValue(typeof v.value === 'object' && v.value !== null && 'value' in v.value ? v.value.value : v.value),
                      },
                  ])
              )

        return {
            id: entry.id,
            name: entry.name,
            componentFile: entry.componentFile,
            componentUid: entry.componentUid,
            status: entry.status,
            leak: entry.leak,
            leakReason: entry.leakReason,
            refs: freshRefs,
            history: entryHistory.get(entry.id) ?? [],
            sharedKeys: computeSharedKeys(entry.id, entry.name),
            watcherCount: entry.watcherCount,
            intervalCount: entry.intervalCount,
            lifecycle: entry.lifecycle,
            file: entry.file,
            line: entry.line,
            route: entry.route,
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

    function clear() {
        for (const stop of liveRefWatchers.values()) stop()
        liveRefWatchers.clear()
        liveRefs.clear()
        rawRefs.clear()
        prevValues.clear()
        entryHistory.clear()
        entries.value.clear()
        emit('composable:clear', {})
    }

    return { register, registerLiveRefs, registerRawRefs, onComposableChange, clear, setRoute, getRoute, update, getAll }
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
    // Use a counter suffix in addition to Date.now() to prevent ID collisions
    // when multiple composables are called within the same millisecond.
    const id = `${name}::${instance?.uid ?? 'global'}::${meta.file}:${meta.line}::${Date.now()}::${Math.random().toString(36).slice(2, 7)}`

    // ── Interval tracking ────────────────────────────────────────────────────
    // We patch window.setInterval/clearInterval to detect leaked timers.
    // IMPORTANT: This patch is NOT re-entrant — if composable A calls composable B
    // during its own setup, B's __trackComposable would overwrite the patched globals
    // and restore them to the already-patched version, leaving window permanently
    // patched after A finishes. Guard against this with a nesting depth counter.
    const trackedIntervals: number[] = []
    const clearedIntervals = new Set<number>()

    // Only patch if we're the outermost __trackComposable call on the stack
    const alreadyPatched = !!(window.setInterval as typeof window.setInterval & { __obs?: boolean }).__obs
    let originalSetInterval: typeof window.setInterval | null = null
    let originalClearInterval: typeof window.clearInterval | null = null

    if (!alreadyPatched) {
        originalSetInterval = window.setInterval
        originalClearInterval = window.clearInterval

        const patchedSetInterval = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) => {
            const timerId = originalSetInterval!(fn, ms, ...rest)
            trackedIntervals.push(timerId as number)
            return timerId
        }) as typeof window.setInterval & { __obs?: boolean }
        patchedSetInterval.__obs = true
        window.setInterval = patchedSetInterval

        window.clearInterval = ((timerId?: number) => {
            if (timerId !== undefined) clearedIntervals.add(timerId)
            originalClearInterval!(timerId)
        }) as typeof window.clearInterval
    }

    const effectsBefore = new Set(instance?.scope?.effects ?? [])
    const mountedHooksBefore = instance?.bm?.length ?? 0
    const unmountedHooksBefore = instance?.um?.length ?? 0

    const result = callFn()

    // Restore globals only if we were the ones who patched them
    if (!alreadyPatched && originalSetInterval) {
        window.setInterval = originalSetInterval
        window.clearInterval = originalClearInterval!
    }

    const trackedWatchers = (instance?.scope?.effects ?? [])
        .filter((effect) => !effectsBefore.has(effect))
        .map((effect) => ({
            effect,
            stop: () => effect.stop?.(),
        }))

    // Snapshot reactive return values for the initial entry,
    // AND keep live references so getAll() can re-read current values.
    // Supports: ref, computed (readonly ref), and reactive() objects.
    const refs: ComposableEntry['refs'] = {}
    const liveRefMap: Record<string, import('vue').Ref<unknown>> = {}
    // Raw unwrapped objects for identity comparison (global vs local detection)
    const rawRefMap: Record<string, unknown> = {}

    if (result && typeof result === 'object') {
        for (const [key, val] of Object.entries(result as object)) {
            if (isRef(val)) {
                const type = isReadonly(val) ? 'computed' : 'ref'
                refs[key] = { type, value: safeSnapshot(unref(val)) }
                liveRefMap[key] = val as import('vue').Ref<unknown>
                rawRefMap[key] = val // store original Ref for identity check
            } else if (isReactive(val)) {
                refs[key] = { type: 'reactive', value: safeSnapshot(val) }
                liveRefMap[key] = computed(() => val) as import('vue').Ref<unknown>
                rawRefMap[key] = val // store original reactive object for identity check
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
        history: [],
        sharedKeys: [], // computed lazily in sanitize() after all instances are registered
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
        route: registry.getRoute(),
    }

    registry.register(entry)
    registry.registerLiveRefs(id, liveRefMap)
    registry.registerRawRefs(id, rawRefMap)

    // Leak detection: only register onUnmounted when called inside a component
    // context — Vue will warn (and the hook will silently no-op) if called globally.
    if (instance) {
        onUnmounted(() => {
            const leakedWatchers = trackedWatchers.filter((w) => w.effect.active)
            const leakedIntervals = trackedIntervals.filter((timerId) => !clearedIntervals.has(timerId))

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
            // Release the live ref closures and stop the watchEffect —
            // the component is gone and we no longer need live updates from it.
            registry.registerLiveRefs(id, {})
        })
    }

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
