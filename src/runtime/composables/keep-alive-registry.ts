import { bumpSnapshotRevision } from '../snapshot-revision'
import { startSpan, type ISpanHandle } from '../tracing/tracing'
import type { IKeepAliveCacheEntry, IKeepAliveEntry, IKeepAliveSnapshot, TKeepAliveCacheStatus } from '../../types/snapshot'

const DEFAULT_MAX_ENTRIES = 300

function cacheKey(name: string, key?: string) {
    return key && key.length > 0 ? `${name}::${key}` : name
}

export type TKeepAliveRecordInput = Omit<IKeepAliveEntry, 'id' | 'durationMs'> & {
    id?: string
}

function durationBetween(startTime: number, endTime?: number) {
    if (endTime === undefined) {
        return undefined
    }

    return Math.round((endTime - startTime) * 10) / 10
}

function resolveDurationMs(
    input: TKeepAliveRecordInput,
    now: number,
    lastDeactivateAt: Map<string, number>,
    durationMs: number | undefined
): number | undefined {
    if (input.kind !== 'keep-alive' || input.phase !== 'activated' || !input.fromCache) {
        return durationMs
    }

    const parkedAt = lastDeactivateAt.get(cacheKey(input.name, input.key))

    if (parkedAt === undefined) {
        return durationMs
    }

    return durationBetween(parkedAt, now)
}

function livingCacheCount(cache: Map<string, IKeepAliveCacheEntry>): number {
    return [...cache.values()].filter((item) => item.status !== 'evicted').length
}

function cacheSizeFor(
    input: TKeepAliveRecordInput,
    cache: Map<string, IKeepAliveCacheEntry>,
    fallback: number | undefined
): number | undefined {
    if (input.kind !== 'keep-alive') {
        return fallback
    }

    return livingCacheCount(cache)
}

function storeEvent(events: IKeepAliveEntry[], entry: IKeepAliveEntry, isUpdate: boolean) {
    if (!isUpdate) {
        events.push(entry)
        return
    }

    const index = events.findIndex((item) => item.id === entry.id)

    if (index === -1) {
        return
    }

    events[index] = entry
}

function startPendingSuspenseSpan(input: TKeepAliveRecordInput, id: string, now: number, activeSpans: Map<string, ISpanHandle>) {
    const handle = startSpan({
        name: `suspense:${input.name}`,
        type: 'suspense',
        metadata: { id, phase: input.phase, parentComponent: input.parentComponent, timeoutMs: input.timeoutMs },
        startTime: now,
    })

    activeSpans.set(id, handle)
}

function traceKeepAliveBoundary(input: TKeepAliveRecordInput, id: string, now: number) {
    startSpan({
        name: `keep-alive:${input.phase}:${input.name}`,
        type: 'keep-alive',
        metadata: { id, phase: input.phase, fromCache: input.fromCache, key: input.key, cacheMax: input.cacheMax },
        startTime: now,
    }).end({ endTime: now, status: 'ok' })
}

function finishOpenSpan(
    span: ISpanHandle | undefined,
    input: TKeepAliveRecordInput,
    id: string,
    now: number,
    endTime: number | undefined,
    fallbackMs: number | undefined,
    activeSpans: Map<string, ISpanHandle>
) {
    if (!span || (input.phase !== 'resolved' && input.phase !== 'interrupted')) {
        return
    }

    span.end({
        endTime: endTime ?? now,
        status: input.phase === 'interrupted' ? 'cancelled' : 'ok',
        metadata: { phase: input.phase, fallbackMs },
    })
    activeSpans.delete(id)
}

function traceRecord(
    input: TKeepAliveRecordInput,
    entry: IKeepAliveEntry,
    id: string,
    now: number,
    endTime: number | undefined,
    activeSpans: Map<string, ISpanHandle>
) {
    if (input.kind === 'suspense' && input.phase === 'pending') {
        startPendingSuspenseSpan(input, id, now, activeSpans)
    } else if (input.kind === 'keep-alive' && (input.phase === 'activated' || input.phase === 'deactivated')) {
        traceKeepAliveBoundary(input, id, now)
    }

    finishOpenSpan(activeSpans.get(id), input, id, now, endTime, entry.fallbackMs, activeSpans)
}

export function setupKeepAliveRegistry(options: { maxEntries?: number } = {}) {
    const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES)
    const events: IKeepAliveEntry[] = []
    const eventsById = new Map<string, IKeepAliveEntry>()
    const cache = new Map<string, IKeepAliveCacheEntry>()
    const lastDeactivateAt = new Map<string, number>()
    const activeSpans = new Map<string, ReturnType<typeof startSpan>>()
    const listeners = new Set<() => void>()
    let seq = 0

    function notify() {
        bumpSnapshotRevision()

        for (const listener of listeners) {
            listener()
        }
    }

    function evictOverflow() {
        while (events.length > maxEntries) {
            const oldest = events.shift()

            if (!oldest) {
                break
            }

            eventsById.delete(oldest.id)
            activeSpans.get(oldest.id)?.end({ endTime: oldest.endTime ?? oldest.startTime, status: 'cancelled' })
            activeSpans.delete(oldest.id)
        }
    }

    function pruneCache(cacheMax?: number) {
        if (cacheMax === undefined || cacheMax < 1) {
            return
        }

        const living = [...cache.values()].filter((entry) => entry.status !== 'evicted')

        if (living.length <= cacheMax) {
            return
        }

        const victims = living.filter((entry) => entry.status === 'cached').sort((a, b) => a.lastEventAt - b.lastEventAt)

        const overflow = living.length - cacheMax

        for (const victim of victims.slice(0, overflow)) {
            cache.set(victim.id, { ...victim, status: 'evicted', lastEventAt: performance.now() })
        }
    }

    function updateCache(input: TKeepAliveRecordInput, at: number) {
        if (input.kind !== 'keep-alive') {
            return
        }

        const id = cacheKey(input.name, input.key)
        const existing = cache.get(id)
        let status: TKeepAliveCacheStatus = existing?.status ?? 'active'
        let hits = existing?.hits ?? 0

        if (input.phase === 'activated') {
            status = 'active'
            hits += 1
        } else if (input.phase === 'deactivated') {
            status = 'cached'
            lastDeactivateAt.set(id, at)
        } else if (input.phase === 'evicted') {
            status = 'evicted'
        }

        cache.set(id, {
            id,
            name: input.name,
            key: input.key ?? input.name,
            status,
            hits,
            cachedAt: existing?.cachedAt ?? at,
            lastEventAt: at,
        })

        pruneCache(input.cacheMax)
    }

    function record(input: TKeepAliveRecordInput): IKeepAliveEntry {
        const now = input.startTime
        const id = input.id ?? `${input.kind}::${input.name}::${now}::${++seq}`
        const existing = eventsById.get(id)
        const endTime = input.endTime ?? existing?.endTime
        const durationMs = resolveDurationMs(input, now, lastDeactivateAt, durationBetween(existing?.startTime ?? input.startTime, endTime))
        const entry: IKeepAliveEntry = {
            ...existing,
            ...input,
            id,
            durationMs,
            cacheSize: cacheSizeFor(input, cache, input.cacheSize),
        }

        storeEvent(events, entry, existing !== undefined)
        eventsById.set(id, entry)
        updateCache(input, now)
        entry.cacheSize = cacheSizeFor(input, cache, entry.cacheSize)
        traceRecord(input, entry, id, now, endTime, activeSpans)
        evictOverflow()
        notify()

        return entry
    }

    function onChange(listener: () => void) {
        listeners.add(listener)

        return () => {
            listeners.delete(listener)
        }
    }

    function getSnapshot(): IKeepAliveSnapshot {
        return {
            events: events.map((entry) => ({ ...entry })),
            cache: [...cache.values()].map((entry) => ({ ...entry })),
        }
    }

    function clear() {
        for (const span of activeSpans.values()) {
            span.end({ status: 'cancelled' })
        }

        events.length = 0
        eventsById.clear()
        cache.clear()
        lastDeactivateAt.clear()
        activeSpans.clear()
        notify()
    }

    return {
        record,
        getSnapshot,
        clear,
        onChange,
    }
}
