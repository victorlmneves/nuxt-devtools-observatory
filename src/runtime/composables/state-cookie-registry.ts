import { isRef, unref, watch, getCurrentInstance, onUnmounted } from 'vue'
import { bumpSnapshotRevision } from '../snapshot-revision'
import type { IStateCookieEntry, TStateCookieKind } from '../../types/snapshot'

export type { IStateCookieEntry, TStateCookieKind }

const MAX_PREVIEW_BYTES = 500
const DEFAULT_MAX_ENTRIES = 200

type TObservatoryWindow = Window & {
    __observatory__?: { stateCookie?: ReturnType<typeof setupStateCookieRegistry> }
}

function previewOf(value: unknown): unknown {
    if (value === undefined || value === null) {
        return value
    }

    try {
        const str = JSON.stringify(value)

        if (str.length <= MAX_PREVIEW_BYTES) {
            return JSON.parse(str)
        }

        return str.slice(0, MAX_PREVIEW_BYTES) + '… (truncated)'
    } catch {
        return '[unserializable]'
    }
}

function readCookieMeta(options: unknown): IStateCookieEntry['cookie'] {
    if (!options || typeof options !== 'object') {
        return undefined
    }

    const rec = options as Record<string, unknown>
    const maxAge = typeof rec.maxAge === 'number' ? rec.maxAge : undefined
    const path = typeof rec.path === 'string' ? rec.path : undefined
    const httpOnly = typeof rec.httpOnly === 'boolean' ? rec.httpOnly : undefined

    if (maxAge === undefined && path === undefined && httpOnly === undefined) {
        return undefined
    }

    return { maxAge, path, httpOnly }
}

function resolveKey(args: unknown[]): string {
    const first = args[0]

    return typeof first === 'string' && first.length > 0 ? first : '(dynamic)'
}

export function setupStateCookieRegistry(options: { maxEntries?: number; isHydrating?: () => boolean } = {}) {
    const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES)
    const entries = new Map<string, IStateCookieEntry>()
    const stopWatchers = new Map<string, () => void>()
    const listeners = new Set<() => void>()

    function notify() {
        bumpSnapshotRevision()
        for (const listener of listeners) {
            listener()
        }
    }

    function evictOverflow() {
        while (entries.size > maxEntries) {
            const oldest = entries.keys().next().value

            if (oldest === undefined) {
                break
            }

            stopWatchers.get(oldest)?.()
            stopWatchers.delete(oldest)
            entries.delete(oldest)
        }
    }

    function upsert(entry: IStateCookieEntry) {
        entries.delete(entry.id)
        entries.set(entry.id, entry)
        evictOverflow()
        notify()
    }

    function onChange(listener: () => void) {
        listeners.add(listener)

        return () => {
            listeners.delete(listener)
        }
    }

    function getSnapshot(): IStateCookieEntry[] {
        return [...entries.values()]
    }

    function clear() {
        for (const stop of stopWatchers.values()) {
            stop()
        }

        stopWatchers.clear()
        entries.clear()
        notify()
    }

    return {
        upsert,
        getSnapshot,
        clear,
        onChange,
        isHydrating: options.isHydrating,
        rememberWatcher(id: string, stop: () => void) {
            stopWatchers.get(id)?.()
            stopWatchers.set(id, stop)
        },
        stopWatcher(id: string) {
            stopWatchers.get(id)?.()
            stopWatchers.delete(id)
        },
    }
}

export function __trackStateCookie<T>(
    original: (...args: unknown[]) => T,
    args: unknown[],
    meta: { kind: TStateCookieKind; file?: string; line?: number }
): T {
    const result = original(...args)
    const registry = (typeof window !== 'undefined' ? (window as TObservatoryWindow).__observatory__?.stateCookie : undefined) as
        ReturnType<typeof setupStateCookieRegistry> | undefined

    if (!registry) {
        return result
    }

    const key = resolveKey(args)
    const id = `${meta.kind}:${key}`
    const origin = registry.isHydrating?.() ? 'ssr' : 'csr'

    const record = (value: unknown) => {
        registry.upsert({
            id,
            kind: meta.kind,
            key,
            origin,
            preview: previewOf(value),
            updatedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
            file: meta.file,
            line: meta.line,
            cookie: meta.kind === 'useCookie' ? readCookieMeta(args[1]) : undefined,
        })
    }

    record(isRef(result) ? unref(result) : result)

    if (isRef(result)) {
        const stop = watch(result, (next) => record(next), { flush: 'sync' })

        registry.rememberWatcher(id, stop)

        if (getCurrentInstance()) {
            onUnmounted(() => {
                registry.stopWatcher(id)
            })
        }
    }

    return result
}
