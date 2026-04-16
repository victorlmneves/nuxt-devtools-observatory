import { getCurrentInstance } from 'vue'
import type { PiniaHydrationEvent, PiniaMutationEvent, PiniaStateDiff, PiniaStoreDependency, PiniaStoreEntry } from '../../types/snapshot'

type PiniaSubscribeMutation = {
    storeId: string
    type: 'direct' | 'patch object' | 'patch function'
    payload?: unknown
}

type PiniaStoreLike = {
    $id: string
    $state: Record<string, unknown>
    $onAction: (
        cb: (ctx: {
            name: string
            args: unknown[]
            after: (cb: () => void) => void
            onError: (cb: (error: unknown) => void) => void
        }) => void
    ) => () => void
    $subscribe: (
        cb: (mutation: PiniaSubscribeMutation, state: Record<string, unknown>) => void,
        opts?: { detached?: boolean }
    ) => () => void
    $patch?: ((mutator: (state: Record<string, unknown>) => void) => void) | ((patch: Record<string, unknown>) => void)
    $persist?: unknown
    $options?: { persist?: unknown }
    persist?: unknown
}

type PiniaLike = {
    _s?: Map<string, PiniaStoreLike>
    use?: (plugin: (ctx: { store: PiniaStoreLike }) => void) => void
}

function nowMs() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
}

function safeSnapshot<T>(value: T): T {
    try {
        return JSON.parse(JSON.stringify(value)) as T
    } catch {
        return value
    }
}

function parsePath(path: string): Array<string | number> {
    return path
        .replace(/\[(\d+)\]/g, '.$1')
        .split('.')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => (/^\d+$/.test(part) ? Number(part) : part))
}

function setAtPath(target: Record<string, unknown>, path: string, value: unknown) {
    const parts = parsePath(path)

    if (parts.length === 0) {
        return
    }

    let cursor: unknown = target

    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i]

        if (!cursor || typeof cursor !== 'object') {
            return
        }

        const objectCursor = cursor as Record<string, unknown>
        const next = objectCursor[String(key)]

        if (next === undefined || next === null || typeof next !== 'object') {
            objectCursor[String(key)] = typeof parts[i + 1] === 'number' ? [] : {}
        }

        cursor = objectCursor[String(key)]
    }

    if (!cursor || typeof cursor !== 'object') {
        return
    }

    ;(cursor as Record<string, unknown>)[String(parts[parts.length - 1])] = value
}

function collectDiff(before: unknown, after: unknown, path = '', depth = 0, out: PiniaStateDiff[] = []): PiniaStateDiff[] {
    if (out.length >= 80 || depth > 6) {
        return out
    }

    if (Object.is(before, after)) {
        return out
    }

    const beforeIsObj = before !== null && typeof before === 'object'
    const afterIsObj = after !== null && typeof after === 'object'

    if (!beforeIsObj || !afterIsObj) {
        out.push({ path: path || '$', before, after })

        return out
    }

    const beforeRec = before as Record<string, unknown>
    const afterRec = after as Record<string, unknown>
    const keys = new Set([...Object.keys(beforeRec), ...Object.keys(afterRec)])

    for (const key of keys) {
        const nextPath = path ? `${path}.${key}` : key
        collectDiff(beforeRec[key], afterRec[key], nextPath, depth + 1, out)

        if (out.length >= 80) {
            break
        }
    }

    return out
}

function stackFromError() {
    const stack = new Error().stack

    if (!stack) {
        return []
    }

    return stack
        .split('\n')
        .slice(2, 10)
        .map((line) => line.trim())
}

function inferDependency(): PiniaStoreDependency {
    const instance = getCurrentInstance()

    if (!instance) {
        return { id: 'unknown', kind: 'unknown', name: 'unknown' }
    }

    const file = (instance.type as { __file?: string } | undefined)?.__file
    const name =
        (instance.type as { __name?: string; name?: string } | undefined)?.__name ||
        (instance.type as { name?: string } | undefined)?.name ||
        (file?.split('/').pop() ?? `component:${instance.uid}`)

    return {
        id: `component:${instance.uid}`,
        kind: 'component',
        name,
        file,
    }
}

function pushUniqueDependency(deps: PiniaStoreDependency[], dependency: PiniaStoreDependency) {
    if (!dependency.id) {
        return
    }

    if (deps.some((item) => item.id === dependency.id)) {
        return
    }

    deps.push(dependency)
}

export function setupPiniaStoreRegistry(options: { pinia?: unknown; nuxtPayload?: unknown; maxTimeline?: number }) {
    const pinia = options.pinia as PiniaLike | undefined
    const maxTimeline = typeof options.maxTimeline === 'number' ? options.maxTimeline : 100

    const entries = new Map<string, PiniaStoreEntry>()
    const stores = new Map<string, PiniaStoreLike>()
    const stopHandles = new Map<string, Array<() => void>>()
    const activeActions = new Map<string, PiniaMutationEvent>()
    const listeners = new Set<() => void>()

    let dirty = true
    let cached = '[]'

    function notifyChange() {
        dirty = true

        for (const listener of listeners) {
            listener()
        }
    }

    function inferHydration(store: PiniaStoreLike): PiniaHydrationEvent {
        const payload = options.nuxtPayload as { pinia?: Record<string, unknown> } | undefined
        const fromPayload = !!payload?.pinia?.[store.$id]
        const hasPersist = !!store.$persist || !!store.$options?.persist || !!store.persist

        return {
            at: nowMs(),
            source: fromPayload ? 'nuxt-payload' : hasPersist ? 'persistedstate' : 'runtime',
            details: fromPayload ? 'Nuxt payload state detected' : hasPersist ? 'Persist plugin detected' : undefined,
        }
    }

    function trimTimeline(entry: PiniaStoreEntry) {
        if (entry.timeline.length <= maxTimeline) {
            return
        }

        entry.timeline.splice(0, entry.timeline.length - maxTimeline)
    }

    function ensureStore(store: PiniaStoreLike) {
        if (!store?.$id || stores.has(store.$id)) {
            return
        }

        stores.set(store.$id, store)

        const entry: PiniaStoreEntry = {
            id: store.$id,
            name: store.$id,
            state: safeSnapshot(store.$state),
            dependencies: [],
            timeline: [],
            hydration: inferHydration(store),
        }

        entries.set(store.$id, entry)

        const offAction = store.$onAction(({ name, args, after, onError }) => {
            const actionId = `${store.$id}:action:${name}:${nowMs()}:${Math.random().toString(36).slice(2, 8)}`
            const start = nowMs()
            const startSnapshot = safeSnapshot(store.$state)
            const dependency = inferDependency()
            const current = entries.get(store.$id)

            if (!current) {
                return
            }

            pushUniqueDependency(current.dependencies, dependency)

            const event: PiniaMutationEvent = {
                id: actionId,
                storeId: store.$id,
                storeName: store.$id,
                kind: 'action',
                name,
                startTime: start,
                status: 'active',
                beforeState: startSnapshot,
                afterState: startSnapshot,
                diff: [],
                payload: safeSnapshot(args),
                callerStack: stackFromError(),
            }

            current.timeline.push(event)
            trimTimeline(current)
            current.lastActionAt = start
            activeActions.set(actionId, event)
            notifyChange()

            after(() => {
                const end = nowMs()
                const done = entries.get(store.$id)

                if (!done) {
                    return
                }

                const afterState = safeSnapshot(store.$state)
                event.endTime = end
                event.durationMs = end - start
                event.status = 'ok'
                event.afterState = afterState
                event.diff = collectDiff(event.beforeState, afterState)
                done.state = afterState
                done.lastMutationAt = end
                activeActions.delete(actionId)
                notifyChange()
            })

            onError((error) => {
                const end = nowMs()
                const done = entries.get(store.$id)

                if (!done) {
                    return
                }

                const afterState = safeSnapshot(store.$state)
                event.endTime = end
                event.durationMs = end - start
                event.status = 'error'
                event.afterState = afterState
                event.diff = collectDiff(event.beforeState, afterState)
                event.error = error instanceof Error ? error.message : String(error)
                done.state = afterState
                done.lastMutationAt = end
                activeActions.delete(actionId)
                notifyChange()
            })
        })

        const offSub = store.$subscribe(
            (mutation, state) => {
                const current = entries.get(store.$id)

                if (!current) {
                    return
                }

                const beforeState = safeSnapshot(current.state)
                const afterState = safeSnapshot(state)
                const at = nowMs()

                const event: PiniaMutationEvent = {
                    id: `${store.$id}:mutation:${at}:${Math.random().toString(36).slice(2, 8)}`,
                    storeId: store.$id,
                    storeName: store.$id,
                    kind: 'mutation',
                    name: mutation.type,
                    startTime: at,
                    endTime: at,
                    durationMs: 0,
                    status: 'ok',
                    beforeState,
                    afterState,
                    diff: collectDiff(beforeState, afterState),
                    payload: safeSnapshot(mutation.payload),
                    callerStack: stackFromError(),
                }

                current.timeline.push(event)
                trimTimeline(current)
                current.state = afterState
                current.lastMutationAt = at
                notifyChange()
            },
            { detached: true }
        )

        stopHandles.set(store.$id, [offAction, offSub])
        notifyChange()
    }

    function clear() {
        for (const [id, entry] of entries) {
            const store = stores.get(id)
            entry.timeline = []
            entry.dependencies = []
            entry.state = safeSnapshot(store?.$state ?? entry.state)
            entry.lastActionAt = undefined
            entry.lastMutationAt = undefined
        }

        notifyChange()
    }

    function editState(storeId: string, path: string, value: unknown) {
        const store = stores.get(storeId)

        if (!store || !path) {
            return
        }

        if (typeof store.$patch === 'function') {
            ;(store.$patch as (fn: (state: Record<string, unknown>) => void) => void)((state) => {
                setAtPath(state, path, value)
            })
        } else {
            setAtPath(store.$state, path, value)
        }

        notifyChange()
    }

    function getAll() {
        return [...entries.values()].map((entry) => ({
            ...entry,
            state: safeSnapshot(entry.state),
            dependencies: [...entry.dependencies],
            timeline: entry.timeline.map((event) => ({
                ...event,
                beforeState: safeSnapshot(event.beforeState),
                afterState: safeSnapshot(event.afterState),
                diff: [...event.diff],
            })),
        }))
    }

    function getSnapshot() {
        if (!dirty) {
            return cached
        }

        try {
            cached = JSON.stringify(getAll())
        } catch {
            cached = '[]'
        }

        dirty = false

        return cached
    }

    function onChange(cb: () => void) {
        listeners.add(cb)

        return () => {
            listeners.delete(cb)
        }
    }

    function teardown() {
        for (const handlers of stopHandles.values()) {
            for (const off of handlers) {
                off()
            }
        }

        stopHandles.clear()
        stores.clear()
        entries.clear()
        activeActions.clear()
        listeners.clear()
        dirty = true
        cached = '[]'
    }

    if (pinia?._s) {
        for (const store of pinia._s.values()) {
            ensureStore(store)
        }
    }

    if (typeof pinia?.use === 'function') {
        pinia.use(({ store }) => {
            ensureStore(store)
        })
    }

    return {
        clear,
        editState,
        getAll,
        getSnapshot,
        onChange,
        teardown,
    }
}
