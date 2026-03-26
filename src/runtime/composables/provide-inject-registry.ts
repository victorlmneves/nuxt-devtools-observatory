import { isRef, isReactive, unref, getCurrentInstance, provide, inject } from 'vue'

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
    /**
     * Scope of the provide:
     * - 'global'    — provided via app.provide() or at the app root (no parent component)
     * - 'layout'    — provided by a layout component (file path contains 'layout')
     * - 'component' — provided by a regular component
     */
    scope: 'global' | 'layout' | 'component'
    /**
     * True when a parent component already provides the same key — this provide shadows it.
     */
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

/**
 * Sets up the provide/inject registry, which tracks all provide/inject calls
 * and their associated metadata (e.g. component name, file, line).
 * @returns {object} The provide/inject registry with `registerProvide`, `registerInject`, `getAll`, and `clear` members.
 */
export function setupProvideInjectRegistry(): {
    registerProvide: (entry: ProvideEntry) => void
    registerInject: (entry: InjectEntry) => void
    getAll: () => { provides: ProvideEntry[]; injects: InjectEntry[] }
    clear: () => void
} {
    // Plain Maps keyed by `${key}:${componentUid}` — O(1) dedup, no Vue reactive overhead.
    // Nothing in the runtime watches these collections, so wrapping them in ref() was wasteful.
    const provides = new Map<string, ProvideEntry>()
    const injects = new Map<string, InjectEntry>()

    function registerProvide(entry: ProvideEntry) {
        // O(1) upsert — replaces an existing entry for the same key + component so
        // re-renders don't accumulate duplicate rows in the graph.
        provides.set(`${entry.key}:${entry.componentUid}`, entry)
        emit('provide:register', entry)
    }

    function registerInject(entry: InjectEntry) {
        injects.set(`${entry.key}:${entry.componentUid}`, entry)
        emit('inject:register', entry)
    }

    function clear() {
        provides.clear()
        injects.clear()
        emit('provide:clear', {})
    }

    function sanitizeProvide(entry: ProvideEntry): ProvideEntry {
        return {
            key: entry.key,
            componentName: entry.componentName,
            componentFile: entry.componentFile,
            componentUid: entry.componentUid,
            parentUid: entry.parentUid,
            parentFile: entry.parentFile,
            isReactive: entry.isReactive,
            // valueSnapshot is already a plain serializable value captured at provide()
            // time by safeSnapshot() in the shim — no need to deep-clone it again here.
            valueSnapshot: entry.valueSnapshot,
            line: entry.line,
            scope: entry.scope,
            isShadowing: entry.isShadowing,
        }
    }

    function sanitizeInject(entry: InjectEntry): InjectEntry {
        return {
            key: entry.key,
            componentName: entry.componentName,
            componentFile: entry.componentFile,
            componentUid: entry.componentUid,
            parentUid: entry.parentUid,
            parentFile: entry.parentFile,
            resolved: entry.resolved,
            resolvedFromFile: entry.resolvedFromFile,
            resolvedFromUid: entry.resolvedFromUid,
            line: entry.line,
        }
    }

    function getAll() {
        return {
            provides: [...provides.values()].map(sanitizeProvide),
            injects: [...injects.values()].map(sanitizeInject),
        }
    }

    function emit(event: string, data: unknown) {
        if (!import.meta.client) {
            return
        }

        const channel = (window as Window & { __nuxt_devtools__?: { channel?: { send: (event: string, data: unknown) => void } } })
            .__nuxt_devtools__?.channel
        channel?.send(event, data)
    }

    return { registerProvide, registerInject, getAll, clear }
}

// ── Dev shims called by Vite transform ────────────────────────────────────
export function __devProvide(key: string | symbol, value: unknown, meta: { file: string; line: number }) {
    provide(key, value)

    if (!import.meta.dev || !import.meta.client) {
        return
    }

    const registry = (window as Window & { __observatory__?: { provideInject?: ReturnType<typeof setupProvideInjectRegistry> } })
        .__observatory__?.provideInject

    if (!registry) {
        return
    }

    const instance = getCurrentInstance()
    const keyStr = String(key)

    // Determine scope: global (no parent component or app root), layout, or component
    const file = meta.file.toLowerCase()
    let scope: ProvideEntry['scope'] = 'component'
    if (!instance?.parent || instance?.parent?.type === instance?.appContext?.app?._component) {
        scope = 'global'
    } else if (file.includes('layout') || file.includes('layouts')) {
        scope = 'layout'
    }

    // Detect shadowing: walk up the parent chain to see if any ancestor already provides this key
    const isShadowing = findProvider(keyStr, instance) !== null

    registry.registerProvide({
        key: keyStr,
        componentName: instance?.type?.__name ?? 'unknown',
        componentFile: meta.file,
        componentUid: instance?.uid ?? -1,
        parentUid: instance?.parent?.uid,
        parentFile: instance?.parent?.type?.__file,
        isReactive: isRef(value) || isReactive(value as object),
        valueSnapshot: safeSnapshot(unref(value)),
        line: meta.line,
        scope,
        isShadowing,
    })
}

export function __devInject<T>(key: string | symbol, defaultValue: T | undefined, meta: { file: string; line: number }): T | undefined {
    const resolved = inject<T>(key, defaultValue as T)

    if (!import.meta.dev || !import.meta.client) {
        return resolved
    }

    const registry = (window as Window & { __observatory__?: { provideInject?: ReturnType<typeof setupProvideInjectRegistry> } })
        .__observatory__?.provideInject

    if (!registry) {
        return resolved
    }

    const instance = getCurrentInstance()
    const providerInfo = findProvider(String(key), instance)

    registry.registerInject({
        key: String(key),
        componentName: instance?.type?.__name ?? 'unknown',
        componentFile: meta.file,
        componentUid: instance?.uid ?? -1,
        parentUid: instance?.parent?.uid,
        parentFile: instance?.parent?.type?.__file,
        resolved: resolved !== undefined,
        resolvedFromFile: providerInfo?.file,
        resolvedFromUid: providerInfo?.uid,
        line: meta.line,
    })

    return resolved
}

/**
 * Walks up the `instance.parent` chain to find the first ancestor that provides the given key.
 * @param {string} key - The injection key to search for
 * @param {ReturnType<typeof getCurrentInstance>} instance - The current component instance
 * @returns {{ file: string, uid: number } | null} The providing ancestor's file and uid, or null
 */
function findProvider(key: string, instance: ReturnType<typeof getCurrentInstance>) {
    let cur = instance?.parent

    while (cur) {
        if (cur.appContext?.provides && key in cur.appContext.provides) {
            return { file: cur.type?.__file ?? 'unknown', uid: cur.uid }
        }

        if (
            (cur as { provides?: Record<string, unknown> }).provides &&
            key in ((cur as { provides?: Record<string, unknown> }).provides ?? {})
        ) {
            return { file: cur.type?.__file ?? 'unknown', uid: cur.uid }
        }

        cur = cur.parent
    }

    return null
}

function safeSnapshot(value: unknown): unknown {
    try {
        if (value === null || value === undefined) {
            return value
        }

        if (typeof value === 'function') {
            return '[Function]'
        }

        if (typeof value === 'object') {
            return JSON.parse(JSON.stringify(value))
        }

        return value
    } catch {
        return '[unserializable]'
    }
}
