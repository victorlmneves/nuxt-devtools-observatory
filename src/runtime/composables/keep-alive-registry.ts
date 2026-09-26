import { bumpSnapshotRevision } from '../snapshot-revision'
import { startSpan } from '../tracing/tracing'
import type {
    IKeepAliveCacheEntry,
    IKeepAliveEntry,
    IKeepAliveSnapshot,
    TKeepAliveCacheStatus,
} from '../../types/snapshot'

export type {
    IKeepAliveCacheEntry,
    IKeepAliveEntry,
    IKeepAliveSnapshot,
    TKeepAliveCacheStatus,
    TKeepAliveKind,
    TKeepAlivePhase,
} from '../../types/snapshot'

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

        const victims = living
            .filter((entry) => entry.status === 'cached')
            .sort((a, b) => a.lastEventAt - b.lastEventAt)

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
        let durationMs = durationBetween(existing?.startTime ?? input.startTime, endTime)

        if (input.kind === 'keep-alive' && input.phase === 'activated' && input.fromCache) {
            const key = cacheKey(input.name, input.key)
            const parkedAt = lastDeactivateAt.get(key)

            if (parkedAt !== undefined) {
                durationMs = durationBetween(parkedAt, now)
            }
        }

        const entry: IKeepAliveEntry = {
            ...existing,
            ...input,
            id,
            durationMs,
            cacheSize: input.kind === 'keep-alive' ? [...cache.values()].filter((item) => item.status !== 'evicted').length : input.cacheSize,
        }

        if (existing) {
            const index = events.findIndex((item) => item.id === id)

            if (index !== -1) {
                events[index] = entry
            }
        } else {
            events.push(entry)
        }

        eventsById.set(id, entry)
        updateCache(input, now)
        entry.cacheSize = input.kind === 'keep-alive' ? [...cache.values()].filter((item) => item.status !== 'evicted').length : entry.cacheSize

        if (input.kind === 'suspense' && input.phase === 'pending') {
            const handle = startSpan({
                name: `suspense:${input.name}`,
                type: 'suspense',
                metadata: { id, phase: input.phase, parentComponent: input.parentComponent, timeoutMs: input.timeoutMs },
                startTime: now,
            })

            activeSpans.set(id, handle)
        } else if (input.kind === 'keep-alive' && (input.phase === 'activated' || input.phase === 'deactivated')) {
            startSpan({
                name: `keep-alive:${input.phase}:${input.name}`,
                type: 'keep-alive',
                metadata: { id, phase: input.phase, fromCache: input.fromCache, key: input.key, cacheMax: input.cacheMax },
                startTime: now,
            }).end({ endTime: now, status: 'ok' })
        }

        const span = activeSpans.get(id)

        if (span && (input.phase === 'resolved' || input.phase === 'interrupted')) {
            span.end({
                endTime: endTime ?? now,
                status: input.phase === 'interrupted' ? 'cancelled' : 'ok',
                metadata: { phase: input.phase, fallbackMs: entry.fallbackMs },
            })
            activeSpans.delete(id)
        }

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
