import { isRef, isReactive, isReadonly, unref, computed, watchEffect, getCurrentInstance, onUnmounted } from 'vue'
import { addSsrPhaseSpan } from '../nitro/ssr-trace-store'

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
    /**
     * Stable per-composable-name identity group id for each shared key.
     * Keys are ref/reactive key names; values are group ids like `group-1`.
     */
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
    /** Route path the composable was registered on, e.g. "/products". */
    route: string
    /** File path of the component that called this composable. */
    callerComponentFile?: string
    /** Whether this composable is called from a layout component (persists across pages). */
    isLayoutComposable?: boolean
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

interface SsrObservatoryEvent {
    context?: {
        __observatoryRequestId?: string
        __ssrFetchStart?: number
    }
}

interface GlobalSsrContextCarrier {
    __observatorySsrContext__?: SsrObservatoryEvent['context']
}

function nowMs() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
}

export function __recordSsrComposableSpan(
    name: string,
    meta: { file: string; line: number },
    startTime: number,
    endTime: number,
    opts: { error?: unknown; event?: SsrObservatoryEvent } = {}
) {
    const eventContext = opts.event?.context ?? (globalThis as GlobalSsrContextCarrier).__observatorySsrContext__
    const requestId = eventContext?.__observatoryRequestId
    const requestStart = eventContext?.__ssrFetchStart

    if (!requestId || typeof requestStart !== 'number') {
        return
    }

    const metadata: Record<string, unknown> = {
        file: meta.file,
        line: meta.line,
        phase: 'setup',
    }

    if (opts.error instanceof Error) {
        metadata.errorMessage = opts.error.message
    }

    addSsrPhaseSpan(requestId, {
        name: `composable:${name}`,
        type: 'composable',
        startMs: Math.max(startTime - requestStart, 0),
        endMs: Math.max(endTime - requestStart, 0),
        error: !!opts.error,
        metadata,
    })
}

/**
 * Registers a new composable entry, updates an existing one, or retrieves all entries.
 * @remarks The returned object exposes the following methods:
 * - `register`: Registers a new composable entry.
 * - `update`: Updates an existing composable entry.
 * - `getAll`: Retrieves all composable entries.
 * - `getSnapshot`: Returns a cached pre-serialized JSON string, rebuilt only when dirty.
 * @returns {{
 *   register: (entry: ComposableEntry) => void,
 *   registerLiveRefs: (id: string, refs: Record<string, import('vue').Ref<unknown>>) => void,
 *   registerRawRefs: (id: string, refs: Record<string, unknown>) => void,
 *   onComposableChange: (cb: () => void) => void,
 *   clear: () => void,
 *   setRoute: (path: string) => void,
 *   getRoute: () => string,
 *   update: (id: string, patch: Partial<ComposableEntry>) => void,
 *   getAll: () => ComposableEntry[],
 *   getSnapshot: () => string,
 *   editValue: (id: string, key: string, value: unknown) => void
 * }} An object with `register`, `update`, `getAll`, `getSnapshot`, and related methods.
 */
export function setupComposableRegistry() {
    // FIX #1: plain Map — no Vue reactivity overhead on every .get()/.set()/.has()
    const entries = new Map<string, ComposableEntry>()

    // Stores live Ref/computed objects keyed by entry id so getAll() can
    // re-read current values on every snapshot rather than serving the
    // stale copy captured at setup time.
    const liveRefs = new Map<string, Record<string, import('vue').Ref<unknown>>>()
    // Stop functions for watchEffect instances tracking each composable's live refs
    const liveRefWatchers = new Map<string, () => void>()
    // Per-entry change history: id → array of RefChangeEvent (capped at MAX_HISTORY)
    // Allow configuration via .env or Nuxt runtime config
    const MAX_HISTORY =
        typeof process !== 'undefined' && process.env.OBSERVATORY_MAX_COMPOSABLE_HISTORY
            ? Number(process.env.OBSERVATORY_MAX_COMPOSABLE_HISTORY)
            : 50
    // Maximum number of composable entries to keep. Unmounted entries are evicted
    // first; if all are mounted the oldest entry is dropped to stay within the cap.
    const MAX_COMPOSABLE_ENTRIES =
        typeof process !== 'undefined' && process.env.OBSERVATORY_MAX_COMPOSABLE_ENTRIES
            ? Number(process.env.OBSERVATORY_MAX_COMPOSABLE_ENTRIES)
            : 300
    const entryHistory = new Map<string, RefChangeEvent[]>()
    // Previous serialised values per ref, used to detect which key actually changed
    const prevValues = new Map<string, Record<string, string>>()
    // Raw (unwrapped) objects per entry — used to detect shared/global state by
    // comparing object identity across instances of the same composable name.
    const rawRefs = new Map<string, Record<string, unknown>>()

    // Cache for shared identity metadata — keyed by composable name.
    // For each entry id we cache both the list of shared keys and a key->group map.
    // Recomputed only when entries are added or removed, never on every getAll() poll tick.
    const sharedKeysCache = new Map<string, Map<string, { keys: string[]; groups: Record<string, string> }>>()

    // FIX #2: dirty flag + cached snapshot string.
    // Set to true whenever any mutation occurs. getSnapshot() rebuilds and
    // re-serializes only when dirty, returning the cached string otherwise.
    let dirty = true
    let cachedSnapshot = '[]'

    function markDirty() {
        dirty = true
    }

    function invalidateSharedKeysForName(name: string) {
        sharedKeysCache.delete(name)
        markDirty()
    }

    // Fully remove an entry and all its associated data from every Map.
    // Called when evicting old entries to enforce MAX_COMPOSABLE_ENTRIES.
    function deleteEntry(entryId: string, entryName: string) {
        // Stop the live watchEffect before releasing everything
        const stop = liveRefWatchers.get(entryId)

        if (stop) {
            stop()
            liveRefWatchers.delete(entryId)
        }

        liveRefs.delete(entryId)
        rawRefs.delete(entryId)
        prevValues.delete(entryId)
        entryHistory.delete(entryId)
        entries.delete(entryId)
        invalidateSharedKeysForName(entryName)
    }

    function getSharedKeys(id: string, name: string): { keys: string[]; groups: Record<string, string> } {
        // Return cached result if available
        let nameCache = sharedKeysCache.get(name)

        if (nameCache && nameCache.has(id)) {
            return nameCache.get(id)!
        }

        // Recompute for all instances of this composable name at once
        nameCache = new Map<string, { keys: string[]; groups: Record<string, string> }>()
        sharedKeysCache.set(name, nameCache)

        // Stable ids for shared object identities within this composable name.
        const identityIds = new WeakMap<object, string>()
        let nextIdentity = 1

        const getIdentityGroup = (obj: unknown) => {
            if (!obj || typeof obj !== 'object') {
                return undefined
            }

            const target = obj as object
            const existing = identityIds.get(target)

            if (existing) {
                return existing
            }

            const created = `group-${nextIdentity++}`
            identityIds.set(target, created)

            return created
        }

        // Collect all entries with this name
        const peers = [...entries.entries()].filter(([, e]) => e.name === name)

        for (const [eid] of peers) {
            const ownRaw = rawRefs.get(eid)
            if (!ownRaw) {
                nameCache.set(eid, { keys: [], groups: {} })
                continue
            }

            const shared = new Set<string>()
            const groups: Record<string, string> = {}

            for (const [otherId] of peers) {
                if (otherId === eid) {
                    continue
                }

                const otherRaw = rawRefs.get(otherId)

                if (!otherRaw) {
                    continue
                }

                for (const [key, obj] of Object.entries(ownRaw)) {
                    if (key in otherRaw && otherRaw[key] === obj) {
                        shared.add(key)

                        const identity = getIdentityGroup(obj)

                        if (identity) {
                            groups[key] = identity
                        }
                    }
                }
            }

            nameCache.set(eid, { keys: [...shared], groups })
        }

        return nameCache.get(id) ?? { keys: [], groups: {} }
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
        // Enforce cap: prefer evicting unmounted entries first since they are
        // historical records the user has already seen. Only evict a mounted
        // entry if every entry is currently mounted (very unusual).
        if (entries.size >= MAX_COMPOSABLE_ENTRIES) {
            const unmountedId = [...entries.entries()].find(([, e]) => e.status === 'unmounted')?.[0]
            const evictId = unmountedId ?? entries.keys().next().value

            if (evictId !== undefined) {
                const evictName = entries.get(evictId)?.name ?? ''
                deleteEntry(evictId, evictName)
            }
        }

        entries.set(entry.id, entry)
        // Invalidate the sharedKeys cache for this composable name so it is
        // recomputed fresh the next time getAll() is called.
        invalidateSharedKeysForName(entry.name)
        markDirty()
        emit('composable:register', entry)
    }

    function registerLiveRefs(id: string, refs: Record<string, import('vue').Ref<unknown>>) {
        // Stop any previous watcher for this entry before replacing refs
        const prevStop = liveRefWatchers.get(id)

        if (prevStop) {
            prevStop()
        }

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

        // One watchEffect() per ref key so only the changed key serializes on each mutation.
        // The old single watchEffect re-ran JSON.stringify on ALL keys whenever ANY
        // one changed — O(k) serializations per change regardless of what changed.
        const stopFns: Array<() => void> = []

        for (const [k, r] of Object.entries(refs)) {
            // Initialise prevValues for this key so the first run doesn't log it as changed
            if (!prevValues.has(id)) {
                prevValues.set(id, {})
            }

            try {
                prevValues.get(id)![k] = JSON.stringify(unref(r)) ?? ''
            } catch {
                prevValues.get(id)![k] = ''
            }

            const stopK = watchEffect(() => {
                const val = unref(r)
                let serialised = ''

                try {
                    serialised = JSON.stringify(val) ?? ''
                } catch {
                    /* leave empty */
                }

                const prev = prevValues.get(id)

                if (prev && serialised !== prev[k]) {
                    // Only this key changed — record history and update stored value
                    const t = typeof performance !== 'undefined' ? performance.now() : Date.now()
                    const history = entryHistory.get(id) ?? []
                    history.push({ t, key: k, value: safeValue(val) })

                    if (history.length > MAX_HISTORY) {
                        history.shift()
                    }

                    entryHistory.set(id, history)
                    prev[k] = serialised
                    markDirty()
                    _scheduleOnChange()
                }
            })

            stopFns.push(stopK)
        }

        // Combine all per-key stop functions into one so liveRefWatchers stays a
        // simple Map<id, () => void> with no changes to the rest of the registry.
        const stop = () => stopFns.forEach((s) => s())
        liveRefWatchers.set(id, stop)
    }

    function registerRawRefs(id: string, refs: Record<string, unknown>) {
        rawRefs.set(id, refs)
    }

    // Callback invoked by the plugin whenever live ref values change.
    // The plugin sets this after mounting so it can trigger a postMessage push.
    let _onChange: (() => void) | null = null

    // rAF handle used to coalesce rapid-fire watcher notifications into a single
    // snapshot send per animation frame. Without this, a single user interaction
    // that touches a shared reactive store triggers one _onChange() call per
    // composable watchEffect — flooding the postMessage channel with dozens of
    // full deep-clone snapshots in the same microtask batch.
    let _pendingFrame: number | null = null

    function _scheduleOnChange() {
        if (_pendingFrame !== null) {
            // Already scheduled for this frame — skip.
            return
        }

        // requestAnimationFrame coalesces all changes within the same frame and
        // automatically pauses when the tab is hidden, avoiding pointless
        // serialisation when the devtools panel is not visible.
        _pendingFrame = requestAnimationFrame(() => {
            _pendingFrame = null
            _onChange?.()
        })
    }

    function onComposableChange(cb: () => void) {
        _onChange = cb
    }

    function update(id: string, patch: Partial<ComposableEntry>) {
        const existing = entries.get(id)

        if (!existing) {
            return
        }

        const updated = { ...existing, ...patch }
        entries.set(id, updated)
        markDirty()
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

        const shared = getSharedKeys(entry.id, entry.name)

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
            sharedKeys: shared.keys,
            sharedKeyGroups: shared.groups,
            watcherCount: entry.watcherCount,
            intervalCount: entry.intervalCount,
            lifecycle: entry.lifecycle,
            file: entry.file,
            line: entry.line,
            route: entry.route,
            callerComponentFile: entry.callerComponentFile,
            isLayoutComposable: entry.isLayoutComposable,
        }
    }

    function getAll(): ComposableEntry[] {
        return [...entries.values()].map(sanitize)
    }

    /**
     * Returns a cached pre-serialized JSON string of all composable entries.
     * Rebuilds and re-serializes only when the registry has been mutated since the
     * last call (dirty flag). On a clean registry the cached string is returned
     * immediately — O(1) instead of O(n × ref count) on every 500ms poll tick.
     * @returns {string} The cached or newly serialized JSON string of all composable entries.
     */
    function getSnapshot(): string {
        if (!dirty) {
            return cachedSnapshot
        }

        try {
            cachedSnapshot = JSON.stringify([...entries.values()].map(sanitize)) ?? '[]'
        } catch {
            cachedSnapshot = '[]'
        }

        dirty = false
        return cachedSnapshot
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
        // Cancel any pending rAF so it doesn't fire after clearing and push stale/empty state
        if (_pendingFrame !== null) {
            cancelAnimationFrame(_pendingFrame)
            _pendingFrame = null
        }

        for (const stop of liveRefWatchers.values()) stop()
        liveRefWatchers.clear()
        liveRefs.clear()
        rawRefs.clear()
        prevValues.clear()
        entryHistory.clear()
        sharedKeysCache.clear()
        entries.clear()
        markDirty()
        emit('composable:clear', {})
    }

    function clearNonLayout() {
        // Cancel any pending rAF so it doesn't fire after clearing and push stale/empty state
        if (_pendingFrame !== null) {
            cancelAnimationFrame(_pendingFrame)
            _pendingFrame = null
        }

        // Only clear non-layout composables, preserving layout-level ones
        const layoutIds = [...entries.entries()].filter(([, entry]) => entry.isLayoutComposable).map(([id]) => id)

        for (const [id] of entries.entries()) {
            if (!layoutIds.includes(id)) {
                const stop = liveRefWatchers.get(id)

                if (stop) {
                    stop()
                    liveRefWatchers.delete(id)
                }

                liveRefs.delete(id)
                rawRefs.delete(id)
                prevValues.delete(id)
                entryHistory.delete(id)
                entries.delete(id)
            }
        }

        sharedKeysCache.clear()
        markDirty()
        emit('composable:clear', {})
    }

    /**
     * Overrides the live value of a writable ref inside a mounted composable.
     * Only works for `ref` type entries (not `computed` — those are read-only).
     * Writing to the live ref triggers the existing watchEffect, which records
     * a history event and calls _onChange() to push an updated snapshot.
     * Allow the DevTools UI to temporarily override a ref value for live testing.
     * Only works for 'ref' (not computed — those are read-only by definition).
     * @param {string} id - The composable entry ID
     * @param {string} key - The ref key to edit
     * @param {unknown} value - The new value to set
     */
    function editValue(id: string, key: string, value: unknown) {
        const live = liveRefs.get(id)

        if (!live) {
            return
        }

        const r = live[key]

        if (!r) {
            return
        }

        const entry = entries.get(id)

        if (!entry) {
            return
        }

        // Guard against computed refs — they are read-only
        if (entry.refs[key]?.type === 'computed') {
            return
        }

        r.value = value
    }

    return {
        register,
        registerLiveRefs,
        registerRawRefs,
        onComposableChange,
        clear,
        clearNonLayout,
        setRoute,
        getRoute,
        update,
        getAll,
        getSnapshot,
        editValue,
    }
}

// ── Dev shim called by Vite transform ─────────────────────────────────────

export function __trackComposable<T>(name: string, callFn: () => T, meta: { file: string; line: number }): T {
    if (!import.meta.dev) {
        return callFn()
    }

    if (!import.meta.client) {
        const startTime = nowMs()

        try {
            const result = callFn()
            __recordSsrComposableSpan(name, meta, startTime, nowMs())

            return result
        } catch (error) {
            __recordSsrComposableSpan(name, meta, startTime, nowMs(), { error })
            throw error
        }
    }

    const registry = (window as Window & { __observatory__?: { composable?: ReturnType<typeof setupComposableRegistry> } }).__observatory__
        ?.composable

    if (!registry) {
        return callFn()
    }

    const instance = getCurrentInstance() as TrackedInstance | null

    // For component instances, generate a unique ID per call (multiple composables
    // of the same type can be active in the same component at the same time).
    // For non-component contexts (middleware, plugins, Pinia stores) use a stable
    // ID derived from name + file + line so that re-executions on every navigation
    // update the existing entry rather than registering a duplicate.
    const id = instance
        ? `${name}::${instance.uid}::${meta.file}:${meta.line}::${Date.now()}::${Math.random().toString(36).slice(2, 7)}`
        : `${name}::global::${meta.file}:${meta.line}`

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
            if (timerId !== undefined) {
                clearedIntervals.add(timerId)
            }

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

    // Detect the calling component's file to check if it's from a layout
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inst = instance as any
    let callerComponentFile: string | undefined

    // Try multiple ways to get the component file path
    if (inst?.type?.__file) {
        callerComponentFile = inst.type.__file
    } else if (inst?.__vueParentComponent?.type?.__file) {
        callerComponentFile = inst.__vueParentComponent.type.__file
    } else if (inst?.parent?.type?.__file) {
        callerComponentFile = inst.parent.type.__file
    } else if (inst?.__vueParentComponent?.fileName) {
        callerComponentFile = inst.__vueParentComponent.fileName
    } else if (inst?.type?.name && inst?.type?.name.includes('default')) {
        // Layouts in Nuxt are typically named 'default'
        callerComponentFile = `layouts/${inst.type.name}.vue`
    }

    // Normalize path separator for cross-platform matching
    const normalizedFile = callerComponentFile?.replace(/\\/g, '/') ?? ''
    const isLayoutComponent = normalizedFile.includes('/layouts/')

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
        callerComponentFile,
        isLayoutComposable: isLayoutComponent,
    }

    // For stable-ID (non-component) entries, update the existing entry if it already
    // exists — middleware and plugins re-run on every navigation and should refresh
    // their single entry rather than accumulate duplicates in the tracker.
    if (!instance && registry.getAll().some((e) => e.id === id)) {
        registry.update(id, {
            status: 'mounted',
            refs,
            watcherCount: trackedWatchers.length,
            intervalCount: trackedIntervals.length,
            route: registry.getRoute(),
        })
    } else {
        registry.register(entry)
    }

    // Only register live refs when called inside a component context.
    // Global composables (instance === null, e.g. from a Nuxt plugin or Pinia store)
    // have no lifecycle — registering liveRefs starts a watchEffect that runs forever
    // with no cleanup, leaking memory and spamming postMessage on every reactive change.
    if (instance) {
        registry.registerLiveRefs(id, liveRefMap)
        registry.registerRawRefs(id, rawRefMap)
    }

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
            // Release live ref closures, stop the watchEffect, and drop the
            // change history — the component is gone, we no longer need live
            // updates or history for it. entryHistory is released here to
            // prevent it accumulating indefinitely across v-if toggles.
            registry.registerLiveRefs(id, {})
            // entryHistory is managed inside the registry closure, cleared via
            // deleteEntry() on eviction or clear() on navigation. Nothing to do here.
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
